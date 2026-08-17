/**
 * Shared sealed-product lookup.
 *
 * Every JustTCG read in the app should go through here. The free tier allows
 * 10 requests/minute against a 100/day budget shared by price sync, search, and
 * anything else, so the rules are centralised rather than re-derived per caller:
 *
 *   - sealed variants only (a raw NM single is not the same product)
 *   - the local `products` table is consulted before the network
 *   - live results are written back so the next caller can skip the network
 *   - pricing by variant id is batched, 20 per request
 *
 * Takes the Supabase client as a parameter (like price-lookup.ts) so the logic
 * is unit-testable without a live database.
 */

/** JustTCG free plan caps a batch price request at 20 variants. */
export const BATCH_SIZE = 20

/** 10 req/min on the free tier. Matches RATE_LIMIT_SPACING_MS in the sync route. */
export const RATE_LIMIT_SPACING_MS = 6500

/**
 * How long a cached product's price stays usable for search results.
 *
 * This must exceed the daily sync interval with margin. At exactly 24h, rows
 * written by the last sync expire a few hours *before* the next one refreshes
 * them (observed: freshest rows were 21.1h old), so every search in that window
 * would spend a request to re-fetch a price sync is about to update anyway. 36h
 * keeps the cache warm across a normal gap and across one skipped run.
 *
 * Search is a browse-and-add surface; portfolio valuation reads price_snapshots,
 * not this. A price up to a day and a half old is acceptable here.
 */
export const CACHE_TTL_MS = 36 * 60 * 60 * 1000

const JUSTTCG_CARDS_URL = "https://api.justtcg.com/v1/cards"

export type SealedVariant = { id: string; condition: string; price: number }

export type SealedProduct = {
  id: string
  name: string
  set: string
  set_name: string
  tcgplayerId: string | null
  variants: SealedVariant[]
  /** Days of price history known for the sealed variant; drives disambiguation. */
  priceHistoryCount?: number
  /**
   * Age of this row's price, in hours. null for a live result (just fetched).
   *
   * Sync only refreshes *held* products, so most of the `products` table carries
   * prices months old. Rather than hide those rows or discard the whole cached
   * result set because one entry is stale, every row reports its own age and the
   * UI marks the old ones — the same disclosure approach the Compare page takes
   * with forward-filled prices.
   */
  priceAgeHours?: number | null
}

export type LookupSource = "cache" | "justtcg"

export type LookupResult = {
  /** Ranked candidates. Callers must disambiguate rather than trusting [0]. */
  candidates: SealedProduct[]
  source: LookupSource
  /** JustTCG requests actually spent. 0 on a cache hit. */
  apiRequestsUsed: number
  /** JustTCG's `_metadata` (carries apiDailyRequestsRemaining). Absent on cache hits. */
  metadata?: unknown
}

export class JustTcgError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "JustTcgError"
  }
}

export function isSealedVariant(condition: string): boolean {
  return condition === "S" || condition === "Sealed"
}

/** The sealed variant of a JustTCG card, or null if it has none. */
export function pickSealedVariant<T extends { condition: string }>(variants: T[] | undefined): T | null {
  return variants?.find((v) => isSealedVariant(v.condition)) ?? null
}

type JustTcgCard = {
  id: string
  name: string
  set: string
  set_name: string
  tcgplayerId?: string | null
  variants?: Array<{
    id: string
    condition: string
    price: number
    priceHistory?: Array<{ t: number; p: number }> | null
  }>
}

type ProductRow = {
  id: string
  name: string
  set_id: string | null
  set_name: string | null
  tcgplayer_id: string | null
  variant_id: string
  current_price: number | string | null
  last_synced_at: string | null
}

/** Split a free-text query into tokens so "prismatic booster" matches
 *  "Prismatic Evolutions Booster Bundle" — a single ILIKE %q% would not. */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[%_]/g, ""))
    .filter((t) => t.length > 1)
}

export function isFresh(lastSyncedAt: string | null, now: number, ttlMs = CACHE_TTL_MS): boolean {
  if (!lastSyncedAt) return false
  const t = Date.parse(lastSyncedAt)
  if (Number.isNaN(t)) return false
  return now - t <= ttlMs
}

function rowToProduct(row: ProductRow, now: number, priceHistoryCount?: number): SealedProduct {
  const price = Number(row.current_price)
  const parsed = row.last_synced_at ? Date.parse(row.last_synced_at) : NaN
  return {
    id: row.id,
    name: row.name,
    set: row.set_id ?? "",
    set_name: row.set_name ?? "",
    tcgplayerId: row.tcgplayer_id,
    // A cached row stores exactly one variant: the sealed one we resolved.
    variants: [{ id: row.variant_id, condition: "S", price: Number.isFinite(price) ? price : 0 }],
    priceHistoryCount,
    priceAgeHours: Number.isNaN(parsed) ? null : Math.max(0, (now - parsed) / 3_600_000),
  }
}

export function normalizeCard(card: JustTcgCard): SealedProduct | null {
  const sealed = pickSealedVariant(card.variants)
  if (!sealed) return null
  return {
    id: card.id,
    name: card.name,
    set: card.set,
    set_name: card.set_name,
    tcgplayerId: card.tcgplayerId ?? null,
    variants: (card.variants ?? []).map((v) => ({
      id: v.id,
      condition: v.condition,
      price: v.price,
    })),
    priceHistoryCount: sealed.priceHistory?.length ?? 0,
  }
}

/**
 * Cache-first sealed-product search.
 *
 * IMPORTANT — the cache is not a complete index. `products` only holds what has
 * previously been searched or held, so a cache hit can return a *narrower* set
 * than JustTCG would. We therefore only serve from cache when every matching
 * row is fresh, and callers that need exhaustive results pass `forceFresh`.
 */
export async function searchSealedProducts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  query: string,
  opts: {
    apiKey?: string
    forceFresh?: boolean
    now?: number
    ttlMs?: number
    fetchImpl?: typeof fetch
  } = {}
): Promise<LookupResult> {
  const q = query.trim()
  if (!q) return { candidates: [], source: "cache", apiRequestsUsed: 0 }

  const now = opts.now ?? Date.now()
  const ttlMs = opts.ttlMs ?? CACHE_TTL_MS

  if (!opts.forceFresh) {
    const cached = await readCache(supabase, q, now)
    if (cached.length > 0) {
      return { candidates: cached, source: "cache", apiRequestsUsed: 0 }
    }
  }

  const live = await fetchFromJustTcg(q, opts.apiKey, opts.fetchImpl)
  if (live.candidates.length > 0) {
    await upsertProducts(supabase, live.candidates, now)
  }
  return live
}

async function readCache(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  query: string,
  now: number
): Promise<SealedProduct[]> {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return []

  let builder = supabase
    .from("products")
    .select("id, name, set_id, set_name, tcgplayer_id, variant_id, current_price, last_synced_at")
  for (const token of tokens) {
    builder = builder.ilike("name", `%${token}%`)
  }
  const { data, error } = await builder.limit(50)
  if (error || !data?.length) return []

  // A row with no price can't be displayed at all, so it's dropped. Age alone
  // never disqualifies a row — it is reported per-row via priceAgeHours and
  // surfaced in the UI, because requiring the whole set to be fresh made the
  // cache miss on nearly every real query (only ~21 of 170 products are kept
  // current by sync, which prices held products only).
  const rows = (data as ProductRow[]).filter((r) => r.current_price != null)
  if (rows.length === 0) return []

  const counts = await countSnapshots(
    supabase,
    rows.map((r) => r.id)
  )
  return rows.map((r) => rowToProduct(r, now, counts[r.id]))
}

/**
 * Days of history per product, from our own price_snapshots rather than
 * JustTCG's priceHistory — same signal, no request cost.
 */
async function countSnapshots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  productIds: string[]
): Promise<Record<string, number>> {
  if (!productIds.length) return {}
  const { data, error } = await supabase
    .from("price_snapshots")
    .select("product_id")
    .in("product_id", productIds)
  if (error || !data) return {}
  const counts: Record<string, number> = {}
  for (const row of data as Array<{ product_id: string }>) {
    counts[row.product_id] = (counts[row.product_id] ?? 0) + 1
  }
  return counts
}

async function fetchFromJustTcg(
  query: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<LookupResult> {
  const key = apiKey ?? process.env.JUSTTCG_API_KEY
  if (!key) throw new JustTcgError("API key not configured", 500)

  const url = new URL(JUSTTCG_CARDS_URL)
  url.searchParams.set("q", query)
  url.searchParams.set("game", "pokemon")
  url.searchParams.set("condition", "S")
  url.searchParams.set("include_price_history", "true")
  url.searchParams.set("priceHistoryDuration", "1y")
  url.searchParams.set("include_statistics", "7d")

  const res = await fetchImpl(url.toString(), {
    headers: { "x-api-key": key },
    next: { revalidate: 0 },
  } as RequestInit)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new JustTcgError(
      (body as { error?: string })?.error || "JustTCG API error",
      res.status
    )
  }

  const json = (await res.json()) as { data?: JustTcgCard[]; _metadata?: unknown }
  const candidates = (json.data ?? [])
    .map(normalizeCard)
    .filter((p): p is SealedProduct => p !== null)

  return { candidates, source: "justtcg", apiRequestsUsed: 1, metadata: json._metadata }
}

/**
 * Write live results back so the next caller can skip the network.
 *
 * Keyed on variant_id, not the card id. JustTCG re-slugs card ids when a product
 * moves between sets (observed: `pokemon-miscellaneous-cards-products-blooming-
 * waters…` became `pokemon-sv-scarlet-violet-151-blooming-waters…`), and an
 * upsert on `id` inserts a second row for the same product. The stored id is
 * also what price_snapshots and transactions reference, so the existing id is
 * kept and the row updated in place rather than re-pointed. This mirrors what
 * sync/route.ts already does when matching batch responses.
 */
export async function upsertProducts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  products: SealedProduct[],
  now = Date.now()
): Promise<void> {
  const resolved = products
    .map((p) => {
      const sealed = pickSealedVariant(p.variants)
      return sealed ? { product: p, sealed } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (resolved.length === 0) return

  // Map variant_id → the id already stored for it, if any.
  const { data: existing } = await supabase
    .from("products")
    .select("id, variant_id")
    .in(
      "variant_id",
      resolved.map((r) => r.sealed.id)
    )
  const idByVariant = new Map<string, string>(
    ((existing ?? []) as Array<{ id: string; variant_id: string }>).map((r) => [r.variant_id, r.id])
  )

  const rows = resolved.map(({ product, sealed }) => ({
    id: idByVariant.get(sealed.id) ?? product.id,
    name: product.name,
    set_id: product.set,
    set_name: product.set_name,
    tcgplayer_id: product.tcgplayerId ?? null,
    variant_id: sealed.id,
    current_price: sealed.price ?? null,
    last_synced_at: new Date(now).toISOString(),
  }))

  await supabase.from("products").upsert(rows, { onConflict: "id" })
}

export type VariantPrice = {
  variantId: string
  price: number | null
  priceHistory: Array<{ t: number; p: number }>
}

/**
 * Batch-price known variant ids, 20 per request with rate-limit spacing.
 *
 * NOTE: this resolves *known* variant ids — JustTCG's batch endpoint does not
 * accept free-text queries, so it cannot be used to turn names into products.
 * Name resolution is one request per name (see searchSealedProducts), which is
 * why any caller with many unknown names is bounded by the rate limit, not by
 * this function.
 */
export async function fetchPricesByVariantId(
  variantIds: string[],
  opts: {
    apiKey?: string
    fetchImpl?: typeof fetch
    /** Injected so tests don't wait 6.5s per batch. */
    sleep?: (ms: number) => Promise<void>
    spacingMs?: number
  } = {}
): Promise<{ prices: Map<string, VariantPrice>; apiRequestsUsed: number }> {
  const prices = new Map<string, VariantPrice>()
  const ids = [...new Set(variantIds.filter(Boolean))]
  if (ids.length === 0) return { prices, apiRequestsUsed: 0 }

  const key = opts.apiKey ?? process.env.JUSTTCG_API_KEY
  if (!key) throw new JustTcgError("API key not configured", 500)

  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const spacing = opts.spacingMs ?? RATE_LIMIT_SPACING_MS

  let apiRequestsUsed = 0
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE)
    const res = await doFetch(JUSTTCG_CARDS_URL, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((variantId) => ({ variantId }))),
    })
    apiRequestsUsed += 1

    if (!res.ok) {
      if (res.status === 429) throw new JustTcgError("Rate limited by JustTCG", 429)
      // Skip this batch rather than failing the whole call — a partial price
      // map is more useful than none, and the caller can see what's missing.
      continue
    }

    const json = (await res.json()) as { data?: JustTcgCard[] }
    for (const card of json.data ?? []) {
      for (const variant of card.variants ?? []) {
        if (!batch.includes(variant.id)) continue
        prices.set(variant.id, {
          variantId: variant.id,
          price: variant.price ?? null,
          priceHistory: variant.priceHistory ?? [],
        })
      }
    }

    if (i + BATCH_SIZE < ids.length) await sleep(spacing)
  }

  return { prices, apiRequestsUsed }
}
