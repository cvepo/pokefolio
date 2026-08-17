import { describe, it, expect } from "vitest"
import {
  BATCH_SIZE,
  fetchPricesByVariantId,
  isFresh,
  isSealedVariant,
  normalizeCard,
  queryTokens,
  searchSealedProducts,
} from "@/lib/product-lookup"

const NOW = Date.parse("2026-08-08T12:00:00Z")
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()

type Row = {
  id: string
  name: string
  set_id: string
  set_name: string
  tcgplayer_id: string | null
  variant_id: string
  current_price: number | string | null
  last_synced_at: string | null
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: "p1",
    name: "Prismatic Evolutions Booster Bundle",
    set_id: "sv8pt5",
    set_name: "Prismatic Evolutions",
    tcgplayer_id: "610553",
    variant_id: "v1",
    current_price: 61.4,
    last_synced_at: hoursAgo(2),
    ...over,
  }
}

function makeSupabase(opts: { products?: Row[]; snapshots?: Array<{ product_id: string }> } = {}) {
  const products = opts.products ?? []
  const snapshots = opts.snapshots ?? []
  const upserted: unknown[] = []

  const client = {
    upserted,
    from(table: string) {
      if (table === "price_snapshots") {
        return { select: () => ({ in: async () => ({ data: snapshots, error: null }) }) }
      }
      const patterns: string[] = []
      const builder = {
        select: () => builder,
        ilike: (_col: string, pattern: string) => {
          patterns.push(pattern.replace(/%/g, "").toLowerCase())
          return builder
        },
        limit: async (n: number) => ({
          data: products
            .filter((p) => patterns.every((t) => p.name.toLowerCase().includes(t)))
            .slice(0, n),
          error: null,
        }),
        // Used by upsertProducts to find the id already stored for a variant_id.
        in: async (col: string, vals: string[]) => ({
          data: products
            .filter((p) => vals.includes(String(p[col as keyof Row])))
            .map((p) => ({ id: p.id, variant_id: p.variant_id })),
          error: null,
        }),
        upsert: async (rows: unknown[]) => {
          upserted.push(...rows)
          return { error: null }
        },
      }
      return builder
    },
  }
  return client
}

function justTcgResponse(cards: unknown[], metadata: unknown = { apiDailyRequestsRemaining: 91 }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: cards, _metadata: metadata }),
  } as unknown as Response
}

const sealedCard = {
  id: "p9",
  name: "Surging Sparks Booster Box",
  set: "sv8",
  set_name: "Surging Sparks",
  tcgplayerId: "588888",
  variants: [
    { id: "v9", condition: "S", price: 119.99, priceHistory: [{ t: 1, p: 118 }] },
  ],
}

describe("helpers", () => {
  it("recognises both sealed condition spellings", () => {
    expect(isSealedVariant("S")).toBe(true)
    expect(isSealedVariant("Sealed")).toBe(true)
    expect(isSealedVariant("NM")).toBe(false)
  })

  it("tokenises queries so word order and gaps still match", () => {
    expect(queryTokens("Prismatic  Booster")).toEqual(["prismatic", "booster"])
    // Single characters and wildcards are dropped rather than passed to ILIKE.
    expect(queryTokens("a %box%")).toEqual(["box"])
  })

  it("treats missing/unparseable timestamps as stale", () => {
    // The window must span a full sync gap: a row written by yesterday's sync
    // is still usable today, one that survived a whole extra day is not.
    expect(isFresh(hoursAgo(2), NOW)).toBe(true)
    expect(isFresh(hoursAgo(35), NOW)).toBe(true)
    expect(isFresh(hoursAgo(40), NOW)).toBe(false)
    expect(isFresh(null, NOW)).toBe(false)
    expect(isFresh("not-a-date", NOW)).toBe(false)
  })

  it("drops cards with no sealed variant", () => {
    expect(normalizeCard(sealedCard)).not.toBeNull()
    expect(
      normalizeCard({ ...sealedCard, variants: [{ id: "v", condition: "NM", price: 5 }] })
    ).toBeNull()
  })
})

describe("searchSealedProducts — cache-first", () => {
  it("serves fresh cache without spending a request", async () => {
    const sb = makeSupabase({
      products: [row()],
      snapshots: [{ product_id: "p1" }, { product_id: "p1" }],
    })
    const res = await searchSealedProducts(sb, "prismatic booster", {
      now: NOW,
      fetchImpl: () => {
        throw new Error("network must not be called on a cache hit")
      },
    })

    expect(res.source).toBe("cache")
    expect(res.apiRequestsUsed).toBe(0)
    expect(res.candidates).toHaveLength(1)
    expect(res.candidates[0].variants[0]).toEqual({ id: "v1", condition: "S", price: 61.4 })
    // History count comes from our own snapshots, at no request cost.
    expect(res.candidates[0].priceHistoryCount).toBe(2)
  })

  it("falls back to JustTCG when the cache is empty, and writes results back", async () => {
    const sb = makeSupabase({ products: [] })
    let called = 0
    const res = await searchSealedProducts(sb, "surging sparks", {
      apiKey: "k",
      now: NOW,
      fetchImpl: async () => {
        called++
        return justTcgResponse([sealedCard])
      },
    })

    expect(called).toBe(1)
    expect(res.source).toBe("justtcg")
    expect(res.apiRequestsUsed).toBe(1)
    expect(res.candidates[0].id).toBe("p9")
    expect(sb.upserted).toEqual([
      expect.objectContaining({ id: "p9", variant_id: "v9", current_price: 119.99 }),
    ])
  })

  it("serves stale rows from cache, reporting each row's age", async () => {
    // Sync only refreshes held products, so most of the table is months old.
    // Rejecting stale rows made the cache miss on nearly every real query;
    // instead the age travels with the row and the UI marks it.
    const sb = makeSupabase({ products: [row({ last_synced_at: hoursAgo(2210) })] })
    const res = await searchSealedProducts(sb, "prismatic booster", {
      now: NOW,
      fetchImpl: () => {
        throw new Error("must not spend a request when the cache has a match")
      },
    })
    expect(res.source).toBe("cache")
    expect(res.candidates[0].priceAgeHours).toBeCloseTo(2210, 0)
  })

  it("reports age per row when matches differ in freshness", async () => {
    const sb = makeSupabase({
      products: [row({ id: "p1" }), row({ id: "p2", last_synced_at: hoursAgo(72) })],
    })
    const res = await searchSealedProducts(sb, "prismatic booster", { now: NOW })
    expect(res.source).toBe("cache")
    const ages = res.candidates.map((c) => Math.round(c.priceAgeHours ?? -1))
    expect(ages).toEqual([2, 72])
  })

  it("drops a priceless row but keeps the rest of the cached set", async () => {
    const sb = makeSupabase({
      products: [row({ id: "p1", current_price: null }), row({ id: "p2" })],
    })
    const res = await searchSealedProducts(sb, "prismatic booster", { now: NOW })
    expect(res.source).toBe("cache")
    expect(res.candidates.map((c) => c.id)).toEqual(["p2"])
  })

  it("goes live when every match lacks a price", async () => {
    const sb = makeSupabase({ products: [row({ current_price: null })] })
    const res = await searchSealedProducts(sb, "prismatic booster", {
      apiKey: "k",
      now: NOW,
      fetchImpl: async () => justTcgResponse([sealedCard]),
    })
    expect(res.source).toBe("justtcg")
  })

  it("live results carry no age (they were just fetched)", async () => {
    const sb = makeSupabase({ products: [] })
    const res = await searchSealedProducts(sb, "surging", {
      apiKey: "k",
      now: NOW,
      fetchImpl: async () => justTcgResponse([sealedCard]),
    })
    expect(res.candidates[0].priceAgeHours ?? null).toBeNull()
  })

  it("forceFresh bypasses an otherwise-usable cache", async () => {
    const sb = makeSupabase({ products: [row()] })
    const res = await searchSealedProducts(sb, "prismatic booster", {
      apiKey: "k",
      now: NOW,
      forceFresh: true,
      fetchImpl: async () => justTcgResponse([sealedCard]),
    })
    expect(res.source).toBe("justtcg")
  })

  it("preserves multiple candidates instead of collapsing to a best match", async () => {
    const sb = makeSupabase({ products: [] })
    const res = await searchSealedProducts(sb, "booster box", {
      apiKey: "k",
      now: NOW,
      fetchImpl: async () =>
        justTcgResponse([
          sealedCard,
          { ...sealedCard, id: "p10", name: "Surging Sparks Booster Bundle" },
          // No sealed variant — must be filtered out, not returned as a third option.
          { ...sealedCard, id: "p11", variants: [{ id: "v11", condition: "NM", price: 4 }] },
        ]),
    })
    expect(res.candidates.map((c) => c.id)).toEqual(["p9", "p10"])
  })

  it("does not write anything when JustTCG returns no sealed products", async () => {
    const sb = makeSupabase({ products: [] })
    const res = await searchSealedProducts(sb, "nothing", {
      apiKey: "k",
      now: NOW,
      fetchImpl: async () => justTcgResponse([]),
    })
    expect(res.candidates).toEqual([])
    expect(sb.upserted).toEqual([])
  })

  it("reuses the stored id when JustTCG re-slugs a card, instead of duplicating", async () => {
    // Real case: `pokemon-miscellaneous-cards-products-blooming-waters…` came
    // back as `pokemon-sv-scarlet-violet-151-blooming-waters…` with the same
    // variant_id. Upserting on the new id inserted a second row for one product
    // — and the stored id is what price_snapshots/transactions reference.
    const stored = row({
      id: "pokemon-miscellaneous-cards-products-blooming-waters",
      variant_id: "shared-variant_sealed",
      last_synced_at: hoursAgo(2210), // stale, so the search goes live
    })
    const sb = makeSupabase({ products: [stored] })

    await searchSealedProducts(sb, "blooming waters", {
      apiKey: "k",
      now: NOW,
      forceFresh: true,
      fetchImpl: async () =>
        justTcgResponse([
          {
            ...sealedCard,
            id: "pokemon-sv-scarlet-violet-151-blooming-waters",
            variants: [{ id: "shared-variant_sealed", condition: "S", price: 321.79 }],
          },
        ]),
    })

    expect(sb.upserted).toHaveLength(1)
    expect(sb.upserted[0]).toMatchObject({
      id: "pokemon-miscellaneous-cards-products-blooming-waters", // kept
      variant_id: "shared-variant_sealed",
      current_price: 321.79, // price still updated
    })
  })

  it("uses the incoming id for a genuinely new variant", async () => {
    const sb = makeSupabase({ products: [] })
    await searchSealedProducts(sb, "surging", {
      apiKey: "k",
      now: NOW,
      fetchImpl: async () => justTcgResponse([sealedCard]),
    })
    expect(sb.upserted[0]).toMatchObject({ id: "p9", variant_id: "v9" })
  })

  it("surfaces JustTCG errors with their status", async () => {
    const sb = makeSupabase({ products: [] })
    await expect(
      searchSealedProducts(sb, "x", {
        apiKey: "k",
        now: NOW,
        fetchImpl: async () =>
          ({ ok: false, status: 429, json: async () => ({ error: "Too many" }) }) as unknown as Response,
      })
    ).rejects.toMatchObject({ status: 429, message: "Too many" })
  })
})

describe("fetchPricesByVariantId — batching", () => {
  it("chunks at 20 per request and spaces batches by the rate limit", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `v${i}`)
    const sizes: number[] = []
    const sleeps: number[] = []

    const { prices, apiRequestsUsed } = await fetchPricesByVariantId(ids, {
      apiKey: "k",
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body)) as Array<{ variantId: string }>
        sizes.push(body.length)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: "c",
                variants: body.map((b) => ({ id: b.variantId, condition: "S", price: 1 })),
              },
            ],
          }),
        } as unknown as Response
      },
    })

    expect(sizes).toEqual([BATCH_SIZE, BATCH_SIZE, 5])
    expect(apiRequestsUsed).toBe(3)
    expect(prices.size).toBe(45)
    // Spacing between batches only — never a trailing sleep after the last one.
    expect(sleeps).toEqual([6500, 6500])
  })

  it("deduplicates ids and short-circuits on an empty list", async () => {
    const sizes: number[] = []
    await fetchPricesByVariantId(["a", "a", "b"], {
      apiKey: "k",
      sleep: async () => {},
      fetchImpl: async (_u, init) => {
        sizes.push(JSON.parse(String((init as RequestInit).body)).length)
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response
      },
    })
    expect(sizes).toEqual([2])

    const empty = await fetchPricesByVariantId([], { apiKey: "k" })
    expect(empty.apiRequestsUsed).toBe(0)
  })

  it("throws on 429 rather than continuing to hammer the API", async () => {
    await expect(
      fetchPricesByVariantId(["a"], {
        apiKey: "k",
        fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response,
      })
    ).rejects.toMatchObject({ status: 429 })
  })

  it("skips a failed batch but still returns prices from the others", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `v${i}`)
    let call = 0
    const { prices, apiRequestsUsed } = await fetchPricesByVariantId(ids, {
      apiKey: "k",
      sleep: async () => {},
      fetchImpl: async (_u, init) => {
        call++
        if (call === 1) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response
        const body = JSON.parse(String((init as RequestInit).body)) as Array<{ variantId: string }>
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: "c", variants: body.map((b) => ({ id: b.variantId, condition: "S", price: 2 })) }],
          }),
        } as unknown as Response
      },
    })
    expect(apiRequestsUsed).toBe(2)
    expect(prices.size).toBe(5)
  })
})
