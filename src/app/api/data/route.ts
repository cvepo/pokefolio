import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { computeHoldings } from "@/lib/holdings"
import type { Transaction, Product } from "@/lib/supabase"

/**
 * GET /api/data?portfolioId=...
 *
 * Returns aggregate stats. If portfolioId is omitted, aggregates across all portfolios.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const portfolioId = searchParams.get("portfolioId")

  let q = supabase.from("transactions").select("*, product:products(*)")
  if (portfolioId) q = q.eq("portfolio_id", portfolioId)

  const { data: txs, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by (portfolio_id, product_id) and compute holdings per group.
  type Group = { txs: Transaction[]; product: Product | undefined; portfolio_id: string; product_id: string }
  const groups = new Map<string, Group>()
  for (const tx of (txs ?? []) as (Transaction & { product?: Product })[]) {
    const key = `${tx.portfolio_id}::${tx.product_id}`
    const g = groups.get(key) ?? {
      txs: [],
      product: tx.product,
      portfolio_id: tx.portfolio_id,
      product_id: tx.product_id,
    }
    g.txs.push(tx)
    if (!g.product && tx.product) g.product = tx.product
    groups.set(key, g)
  }

  let totalInvested = 0
  let totalProceeds = 0
  let totalRealized = 0
  let totalUnrealized = 0
  let totalBuyQty = 0
  let totalSellQty = 0
  let profitableSells = 0
  let totalSells = 0
  let bestPerformer: { name: string; pnl: number } | null = null
  let worstPerformer: { name: string; pnl: number } | null = null

  let activeHoldingsValue = 0
  let activeHoldingsCost = 0

  for (const g of groups.values()) {
    const h = computeHoldings(g.txs)
    totalInvested += h.totalInvested
    totalProceeds += h.totalProceeds
    totalRealized += h.realizedPnL
    totalBuyQty += h.totalBuyQty
    totalSellQty += h.totalSellQty
    profitableSells += h.profitableSells
    totalSells += h.totalSells

    const currentPrice = g.product?.current_price ? Number(g.product.current_price) : null
    const marketPerUnit = currentPrice ?? h.avgCostRemaining
    const positionValue = h.netQty * marketPerUnit
    const positionCost = h.costBasisRemaining
    const unrealized = positionValue - positionCost
    totalUnrealized += unrealized

    activeHoldingsValue += positionValue
    activeHoldingsCost += positionCost

    if (h.netQty > 0 || h.realizedPnL !== 0) {
      const totalPnL = unrealized + h.realizedPnL
      const name = g.product?.name ?? g.product_id
      if (bestPerformer === null || totalPnL > bestPerformer.pnl) {
        bestPerformer = { name, pnl: totalPnL }
      }
      if (worstPerformer === null || totalPnL < worstPerformer.pnl) {
        worstPerformer = { name, pnl: totalPnL }
      }
    }
  }

  const winRate = totalSells > 0 ? profitableSells / totalSells : null
  const netCashFlow = totalProceeds - totalInvested

  return NextResponse.json({
    totalInvested,
    totalProceeds,
    netCashFlow,
    totalRealized,
    totalUnrealized,
    totalBuyQty,
    totalSellQty,
    totalSells,
    profitableSells,
    winRate,
    bestPerformer,
    worstPerformer,
    activeHoldingsValue,
    activeHoldingsCost,
  })
}
