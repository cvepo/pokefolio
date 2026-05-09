import { supabase } from "@/lib/supabase"
import { computeHoldings } from "@/lib/holdings"
import { buildPriceIndex, priceOnOrBefore, daterange, fetchAllPriceSnapshots } from "@/lib/price-lookup"
import type { Transaction } from "@/lib/supabase"

/**
 * Compute "projected" portfolio value over time: pretend the user has always
 * held exactly what they hold today, and apply that constant quantity to each
 * product's historical price.
 *
 * Returns rows shaped identically to the persisted portfolio_snapshots table
 * so the UI can consume both modes interchangeably.
 *
 * Date range matches the actual mode (earliest transaction → today) so the
 * X-axis aligns when toggling.
 */
export async function computeProjectedSnapshots(
  portfolioIds?: string[]
): Promise<Array<{ portfolio_id: string; snapshot_date: string; total_value: number }>> {
  const today = new Date().toISOString().split("T")[0]

  let txQuery = supabase
    .from("transactions")
    .select("id, portfolio_id, product_id, type, quantity, price, transaction_date, notes, created_at")
  if (portfolioIds?.length) {
    txQuery = txQuery.in("portfolio_id", portfolioIds)
  }
  const { data: allTxs } = await txQuery
  if (!allTxs?.length) return []

  // Earliest transaction date determines the X-axis start (matches actual mode).
  let earliest: string | null = null
  for (const t of allTxs) {
    if (earliest === null || t.transaction_date < earliest) earliest = t.transaction_date
  }
  if (!earliest) return []

  // Group transactions by (portfolio, product) and compute current holdings.
  // Keep only groups with netQty > 0.
  type Held = { qty: number; avgCost: number }
  const heldByPortfolio: Record<string, Record<string, Held>> = {}
  const productIds = new Set<string>()

  const groups: Record<string, Record<string, Transaction[]>> = {}
  for (const t of allTxs as Transaction[]) {
    ;((groups[t.portfolio_id] ??= {})[t.product_id] ??= []).push(t)
  }

  for (const [portfolio_id, productMap] of Object.entries(groups)) {
    for (const [product_id, txs] of Object.entries(productMap)) {
      const h = computeHoldings(txs)
      if (h.netQty <= 0) continue
      ;(heldByPortfolio[portfolio_id] ??= {})[product_id] = {
        qty: h.netQty,
        avgCost: h.avgCostRemaining,
      }
      productIds.add(product_id)
    }
  }

  if (productIds.size === 0) return []

  const allPriceSnaps = await fetchAllPriceSnapshots(supabase, [...productIds])
  const pricesByProduct = buildPriceIndex(allPriceSnaps)
  const dates = daterange(earliest, today)
  const rows: Array<{ portfolio_id: string; snapshot_date: string; total_value: number }> = []

  for (const date of dates) {
    for (const [portfolio_id, held] of Object.entries(heldByPortfolio)) {
      let total = 0
      let any = false
      for (const [product_id, h] of Object.entries(held)) {
        const market = priceOnOrBefore(pricesByProduct, product_id, date)
        const perUnit = market ?? h.avgCost
        total += h.qty * perUnit
        any = true
      }
      if (any) rows.push({ portfolio_id, snapshot_date: date, total_value: total })
    }
  }

  return rows
}
