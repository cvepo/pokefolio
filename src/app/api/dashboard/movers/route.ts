import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { computeHoldings } from "@/lib/holdings"
import { fetchAllPriceSnapshots, buildPriceIndex, priceOnOrBefore } from "@/lib/price-lookup"
import type { Transaction } from "@/lib/supabase"

const TIMEFRAME_DAYS: Record<string, number> = {
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "MAX": Infinity,
}

type Mover = {
  product_id: string
  name: string
  set_name: string
  tcgplayer_id: string | null
  current_price: number
  start_price: number
  change_per_unit: number
  change_pct: number
  qty_held: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const timeframe = searchParams.get("timeframe") ?? "1M"
  const days = TIMEFRAME_DAYS[timeframe] ?? 30

  // 1) Pull all transactions, compute current netQty per product (across all portfolios).
  const { data: txs } = await supabase.from("transactions").select("*")
  if (!txs?.length) return NextResponse.json({ winners: [], losers: [] })

  const txByProduct: Record<string, Record<string, Transaction[]>> = {}
  for (const t of txs as Transaction[]) {
    ;((txByProduct[t.product_id] ??= {})[t.portfolio_id] ??= []).push(t)
  }

  const heldQty = new Map<string, number>()
  for (const [productId, byPortfolio] of Object.entries(txByProduct)) {
    let total = 0
    for (const ptxs of Object.values(byPortfolio)) {
      total += computeHoldings(ptxs).netQty
    }
    if (total > 0) heldQty.set(productId, total)
  }

  if (heldQty.size === 0) return NextResponse.json({ winners: [], losers: [] })

  const productIds = [...heldQty.keys()]

  // 2) Product metadata
  const { data: products } = await supabase
    .from("products")
    .select("id, name, set_name, tcgplayer_id, current_price")
    .in("id", productIds)

  // 3) All price snapshots (paginated)
  const snaps = await fetchAllPriceSnapshots(supabase, productIds)
  const priceIdx = buildPriceIndex(snaps)

  const today = new Date().toISOString().split("T")[0]
  let cutoffDate: string
  if (days === Infinity) {
    cutoffDate = "1900-01-01"
  } else {
    const c = new Date()
    c.setUTCDate(c.getUTCDate() - days)
    cutoffDate = c.toISOString().split("T")[0]
  }

  const movers: Mover[] = []
  for (const product of products ?? []) {
    const qty = heldQty.get(product.id) ?? 0
    if (qty <= 0) continue

    const currentMarket = priceOnOrBefore(priceIdx, product.id, today)
    const currentPrice = currentMarket ?? (product.current_price != null ? Number(product.current_price) : null)
    if (currentPrice == null || currentPrice === 0) continue

    // Start price: most recent snapshot ≤ cutoff. If none (product is newer than the
    // window), fall back to the earliest snapshot we have so the % still has meaning.
    let startPrice = priceOnOrBefore(priceIdx, product.id, cutoffDate)
    if (startPrice == null) {
      const arr = priceIdx[product.id]
      if (!arr?.length) continue
      startPrice = arr[0].price
    }
    if (startPrice === 0) continue

    const changePerUnit = currentPrice - startPrice
    const changePct = (changePerUnit / startPrice) * 100

    movers.push({
      product_id: product.id,
      name: product.name,
      set_name: product.set_name,
      tcgplayer_id: product.tcgplayer_id,
      current_price: currentPrice,
      start_price: startPrice,
      change_per_unit: changePerUnit,
      change_pct: changePct,
      qty_held: qty,
    })
  }

  // Sort by % change desc. Top 4 = biggest winners. Then take the bottom 4
  // from the REMAINING (excluding winners) so losers are always populated when
  // possible, even if they happen to have a positive % (just the worst-performing).
  // Order losers most-negative → greatest.
  const sorted = [...movers].sort((a, b) => b.change_pct - a.change_pct)
  const winners = sorted.slice(0, 4)
  const remaining = sorted.slice(4)
  const losers = remaining.slice(-4).reverse()

  return NextResponse.json({ winners, losers })
}
