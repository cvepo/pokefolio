import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { computeHoldings } from "@/lib/holdings"
import type { Transaction, Product } from "@/lib/supabase"

/**
 * GET /api/portfolios/[id]/items
 *
 * Returns the current "holdings view" for a portfolio: one row per product
 * still held (netQty > 0), with FIFO-derived avg cost, realized P&L, etc.
 *
 * This shape is intentionally similar to the old portfolio_items rows
 * so existing UI code can consume it with minimal changes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: txs, error } = await supabase
    .from("transactions")
    .select("*, product:products(*)")
    .eq("portfolio_id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group transactions by product_id and compute holdings for each.
  const byProduct = new Map<string, { txs: Transaction[]; product: Product | undefined }>()
  for (const tx of (txs ?? []) as (Transaction & { product?: Product })[]) {
    const entry = byProduct.get(tx.product_id) ?? { txs: [], product: tx.product }
    entry.txs.push(tx)
    if (!entry.product && tx.product) entry.product = tx.product
    byProduct.set(tx.product_id, entry)
  }

  const items = []
  for (const [productId, { txs: productTxs, product }] of byProduct) {
    const h = computeHoldings(productTxs)
    if (h.netQty <= 0) continue // sold out — hide
    items.push({
      product_id: productId,
      product,
      quantity: h.netQty,
      purchase_price: h.avgCostRemaining,
      purchase_date: h.earliestRemainingBuyDate,
      realized_pnl: h.realizedPnL,
      total_buy_qty: h.totalBuyQty,
      total_sell_qty: h.totalSellQty,
    })
  }

  return NextResponse.json(items)
}
