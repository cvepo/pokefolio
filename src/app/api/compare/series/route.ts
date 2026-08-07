import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { computeHoldings } from "@/lib/holdings"
import { fetchAllPriceSnapshots } from "@/lib/price-lookup"
import type { CompareProduct, CompareSeriesResponse } from "@/lib/compare-series"
import type { Transaction } from "@/lib/supabase"

export async function GET() {
  const { data: txs } = await supabase.from("transactions").select("*")
  if (!txs?.length) {
    return NextResponse.json({
      products: [],
      meta: {
        as_of_date: "",
        earliest_date: "",
        products_current: 0,
        products_total: 0,
        total_starting_value: 0,
      },
    } satisfies CompareSeriesResponse)
  }

  // Group by (product_id, portfolio_id) → computeHoldings per group → sum netQty.
  const txByProduct: Record<string, Record<string, Transaction[]>> = {}
  for (const t of txs as Transaction[]) {
    ;((txByProduct[t.product_id] ??= {})[t.portfolio_id] ??= []).push(t)
  }

  const held = new Map<string, { qty: number; costBasisRemaining: number }>()
  for (const [productId, byPortfolio] of Object.entries(txByProduct)) {
    let qty = 0
    let costBasisRemaining = 0
    for (const ptxs of Object.values(byPortfolio)) {
      const h = computeHoldings(ptxs)
      qty += h.netQty
      costBasisRemaining += h.costBasisRemaining
    }
    if (qty > 0) held.set(productId, { qty, costBasisRemaining })
  }

  if (held.size === 0) {
    return NextResponse.json({
      products: [],
      meta: {
        as_of_date: "",
        earliest_date: "",
        products_current: 0,
        products_total: 0,
        total_starting_value: 0,
      },
    } satisfies CompareSeriesResponse)
  }

  const productIds = [...held.keys()]

  const { data: products } = await supabase
    .from("products")
    .select("id, name, set_name, tcgplayer_id, current_price")
    .in("id", productIds)

  // Required: page past Supabase's 1,000-row default cap.
  const snaps = await fetchAllPriceSnapshots(supabase, productIds)

  // Group history by product, coerce prices, drop invalid rows.
  const historyByProduct = new Map<string, Array<[string, number]>>()
  for (const row of snaps) {
    const price = Number(row.price)
    if (price == null || Number.isNaN(price) || price <= 0) continue
    const arr = historyByProduct.get(row.product_id) ?? []
    arr.push([row.snapshot_date, price])
    historyByProduct.set(row.product_id, arr)
  }
  for (const arr of historyByProduct.values()) {
    arr.sort((a, b) => a[0].localeCompare(b[0]))
  }

  let asOfDate = ""
  let earliestDate = ""
  for (const arr of historyByProduct.values()) {
    if (!arr.length) continue
    const first = arr[0][0]
    const last = arr[arr.length - 1][0]
    if (!earliestDate || first < earliestDate) earliestDate = first
    if (!asOfDate || last > asOfDate) asOfDate = last
  }

  const productMeta = new Map(
    (products ?? []).map((p) => [
      p.id as string,
      p as {
        id: string
        name: string
        set_name: string
        tcgplayer_id: string | null
        current_price: number | string | null
      },
    ])
  )

  const result: CompareProduct[] = []
  let totalStartingValue = 0
  let productsCurrent = 0

  for (const productId of productIds) {
    const h = held.get(productId)!
    const meta = productMeta.get(productId)
    const history = historyByProduct.get(productId) ?? []
    const lastSnapshotDate = history.length ? history[history.length - 1][0] : null
    const latestSnapshotPrice = history.length ? history[history.length - 1][1] : null

    let currentPrice: number
    let currentPriceSource: "snapshot" | "products_fallback"
    if (latestSnapshotPrice != null) {
      currentPrice = latestSnapshotPrice
      currentPriceSource = "snapshot"
    } else {
      const fallback = meta?.current_price != null ? Number(meta.current_price) : NaN
      if (!Number.isFinite(fallback) || fallback <= 0) continue
      currentPrice = fallback
      currentPriceSource = "products_fallback"
    }

    const avgCost = h.qty > 0 ? h.costBasisRemaining / h.qty : 0
    totalStartingValue += currentPrice * h.qty

    if (lastSnapshotDate === asOfDate) productsCurrent += 1

    result.push({
      product_id: productId,
      name: meta?.name ?? productId,
      set_name: meta?.set_name ?? "",
      tcgplayer_id: meta?.tcgplayer_id ?? null,
      qty: h.qty,
      avg_cost: avgCost,
      current_price: currentPrice,
      current_price_source: currentPriceSource,
      last_snapshot_date: lastSnapshotDate,
      history,
    })
  }

  // Sort by name for stable payload ordering; client sorts by Δ%.
  result.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    products: result,
    meta: {
      as_of_date: asOfDate,
      earliest_date: earliestDate,
      products_current: productsCurrent,
      products_total: result.length,
      // Denominator for returnContribution (v2). Client recomputes from window
      // anchors for accuracy; this is the live portfolio market value.
      total_starting_value: totalStartingValue,
    },
  } satisfies CompareSeriesResponse)
}
