import { supabase } from "@/lib/supabase"
import { computeHoldingsAsOf } from "@/lib/holdings"
import { buildPriceIndex, priceOnOrBefore, daterange } from "@/lib/price-lookup"
import type { Transaction } from "@/lib/supabase"

/**
 * Rebuilds portfolio_snapshots from existing transactions + price_snapshots data.
 * No external API calls. Pass portfolioIds to scope; omit to rebuild all.
 */
export async function rebuildPortfolioSnapshots(portfolioIds?: string[]): Promise<void> {
  const today = new Date().toISOString().split("T")[0]

  let txQuery = supabase
    .from("transactions")
    .select("id, portfolio_id, product_id, type, quantity, price, transaction_date, notes, created_at")
  if (portfolioIds?.length) {
    txQuery = txQuery.in("portfolio_id", portfolioIds)
  }
  const { data: allTxs } = await txQuery
  if (!allTxs?.length) return

  const productIds = [...new Set(allTxs.map((t) => t.product_id))]

  const { data: allPriceSnaps } = await supabase
    .from("price_snapshots")
    .select("product_id, price, snapshot_date")
    .in("product_id", productIds)

  const pricesByProduct = buildPriceIndex(allPriceSnaps ?? [])

  // Earliest date to compute from = earliest transaction date overall.
  let earliest: string | null = null
  for (const t of allTxs) {
    if (earliest === null || t.transaction_date < earliest) {
      earliest = t.transaction_date
    }
  }
  if (!earliest) return

  const dates = daterange(earliest, today)

  // Group transactions by (portfolio_id, product_id).
  const byPortfolioProduct: Record<string, Record<string, Transaction[]>> = {}
  for (const t of allTxs as Transaction[]) {
    ;((byPortfolioProduct[t.portfolio_id] ??= {})[t.product_id] ??= []).push(t)
  }

  const rows: Array<{ portfolio_id: string; total_value: number; snapshot_date: string }> = []

  for (const date of dates) {
    for (const [portfolio_id, productMap] of Object.entries(byPortfolioProduct)) {
      let total = 0
      let anyHeld = false
      for (const [product_id, productTxs] of Object.entries(productMap)) {
        const h = computeHoldingsAsOf(productTxs, date)
        if (h.netQty <= 0) continue
        anyHeld = true
        const market = priceOnOrBefore(pricesByProduct, product_id, date)
        const perUnit = market ?? h.avgCostRemaining
        total += h.netQty * perUnit
      }
      if (anyHeld) rows.push({ portfolio_id, total_value: total, snapshot_date: date })
    }
  }

  if (!rows.length) return

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await supabase
      .from("portfolio_snapshots")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "portfolio_id,snapshot_date" })
  }
}
