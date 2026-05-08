import { supabase } from "@/lib/supabase"

/**
 * Fetches up to 1 year of price history from JustTCG for a product variant
 * and upserts any entries on or after `fromDate` into price_snapshots.
 * Safe to call fire-and-forget; errors are silently swallowed so they never
 * block the primary request.
 */
export async function backfillPriceHistory(
  productId: string,
  variantId: string,
  fromDate: string | null
): Promise<void> {
  const apiKey = process.env.JUSTTCG_API_KEY
  if (!apiKey || !variantId) return

  try {
    const url = new URL("https://api.justtcg.com/v1/cards")
    url.searchParams.set("variantId", variantId)
    url.searchParams.set("include_price_history", "true")
    // SDK exposes camelCase but JustTCG's URL params follow snake_case for the
    // include_*/duration knobs. Set both to be safe across API versions.
    url.searchParams.set("price_history_duration", "1y")
    url.searchParams.set("priceHistoryDuration", "1y")
    url.searchParams.set("game", "pokemon")

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
      next: { revalidate: 0 },
    })
    if (!res.ok) return

    const result = await res.json()
    const cards: Array<{
      id: string
      variants?: Array<{
        id: string
        condition: string
        priceHistory?: Array<{ t: number; p: number }> | null
      }>
    }> = result.data ?? []

    const card = cards.find((c) => c.id === productId) ?? cards[0]
    if (!card) return

    const variant = card.variants?.find(
      (v) => v.id === variantId || v.condition === "S" || v.condition === "Sealed"
    )
    const history = variant?.priceHistory ?? []
    if (!history.length) return

    const cutoffMs = fromDate ? new Date(fromDate).getTime() : 0

    const rows = history
      .filter((entry) => entry.t * 1000 >= cutoffMs)
      .map((entry) => ({
        product_id: productId,
        price: entry.p,
        snapshot_date: new Date(entry.t * 1000).toISOString().split("T")[0],
      }))

    if (!rows.length) return

    await supabase.from("price_snapshots").upsert(rows, {
      onConflict: "product_id,snapshot_date",
    })
  } catch {
    // non-critical — never block the calling request
  }
}
