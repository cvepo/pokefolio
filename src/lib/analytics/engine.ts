import { supabase } from "@/lib/supabase-server"
import { computeHoldings, computeHoldingsAsOf } from "@/lib/holdings"
import { buildPriceIndex, daterange, fetchAllPriceSnapshots, priceOnOrBefore } from "@/lib/price-lookup"
import { classifyExitReviewSignal, computeMomentum7d, daysBetween } from "@/lib/compare-series"
import { computeProjectedSnapshots } from "@/lib/projected-snapshots"
import { effectiveCategory } from "./categorize"
import { computeHoldingPeriod } from "./holding-period"
import { computeTrackedAth } from "./tracked-ath"
import type { Product, Transaction } from "@/lib/supabase"
import type { ActivityItem, PortfolioAllocation, PortfolioPerformance, PortfolioSummary, Position, ProductCategory, Timeframe, ValueChange } from "@/lib/dashboard/contract"
import { TIMEFRAMES, TIMEFRAME_DAYS, toCents, toCentsOrNull } from "@/lib/dashboard/contract"

type ProductRow = Product & { category_override?: ProductCategory | null }
type Source = { syncRunId?: string; transactionId?: string }

function dateMinus(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function buildPerformance(
  actualByDate: Map<string, number>, projectedByDate: Map<string, number>, today: string,
  requested: Timeframe
): PortfolioPerformance & { seriesByTimeframe: Record<Timeframe, PortfolioPerformance["series"]> } {
  const dates = [...new Set([...actualByDate.keys(), ...projectedByDate.keys()])].sort()
  const earliest = dates[0] ?? today
  const endValue = actualByDate.get(today) ?? actualByDate.get([...actualByDate.keys()].sort().at(-1) ?? "") ?? 0
  const timeframes: ValueChange[] = TIMEFRAMES.map((timeframe) => {
    const days = TIMEFRAME_DAYS[timeframe]
    const wanted = days === Infinity ? earliest : dateMinus(today, days)
    const startDate = [...actualByDate.keys()].filter((d) => d >= wanted && d <= today).sort()[0] ?? null
    const startValue = startDate ? actualByDate.get(startDate) ?? null : null
    return {
      timeframe, startDate, endDate: today,
      startValue: startValue == null ? null : toCents(startValue), endValue: toCents(endValue),
      valueChangeAbs: startValue == null ? null : toCents(endValue - startValue),
      valueChangePct: startValue ? (endValue - startValue) / startValue : null,
      hasFullHistory: startDate != null && startDate <= wanted,
    }
  })
  const seriesFor = (timeframe: Timeframe) => {
    const cutoff = timeframe === "MAX" ? earliest : dateMinus(today, TIMEFRAME_DAYS[timeframe])
    return dates.filter((date) => date >= cutoff && date <= today).map((date) => ({
      date, actual: toCentsOrNull(actualByDate.get(date)), projected: toCentsOrNull(projectedByDate.get(date)),
    }))
  }
  return {
    timeframes, seriesTimeframe: requested, series: seriesFor(requested),
    seriesByTimeframe: Object.fromEntries(TIMEFRAMES.map((timeframe) => [timeframe, seriesFor(timeframe)])) as Record<Timeframe, PortfolioPerformance["series"]>,
  }
}

/** Recomputes from stored domain data only. This function never calls a pricing API. */
export async function publishAnalyticsSnapshot(opts: {
  portfolioId?: string; timeframe?: Timeframe; source?: Source; asOf?: Date
} = {}): Promise<string> {
  const startedAt = new Date().toISOString()
  const asOf = opts.asOf ?? new Date()
  const today = asOf.toISOString().slice(0, 10)
  const { data: pending, error: startError } = await supabase.from("analytics_snapshots").insert({
    as_of: asOf.toISOString(), scope_portfolio_id: opts.portfolioId ?? null,
    source_sync_run_id: opts.source?.syncRunId ?? null,
    source_transaction_id: opts.source?.transactionId ?? null,
    status: "pending", started_at: startedAt,
  }).select("id").single()
  if (startError || !pending) throw new Error(startError?.message ?? "Could not start analytics snapshot")
  const snapshotId = (pending as { id: string }).id

  try {
    let txQuery = supabase.from("transactions").select("*, product:products(*)")
    if (opts.portfolioId) txQuery = txQuery.eq("portfolio_id", opts.portfolioId)
    const [{ data: txRows, error: txError }, { data: portfolios }, { data: lastRun }] = await Promise.all([
      txQuery,
      supabase.from("portfolios").select("id,name"),
      supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    if (txError) throw new Error(txError.message)
    const txs = (txRows ?? []) as Array<Transaction & { product?: ProductRow }>
    const groups = new Map<string, Transaction[]>()
    const productById = new Map<string, ProductRow>()
    for (const tx of txs) {
      groups.set(tx.product_id, [...(groups.get(tx.product_id) ?? []), tx])
      if (tx.product) productById.set(tx.product_id, tx.product)
    }
    const productIds = [...groups.keys()]
    const snaps = await fetchAllPriceSnapshots(supabase, productIds)
    const priceIndex = buildPriceIndex(snaps)
    const failures = new Set(((lastRun as { failures?: Array<{ product_id: string }> } | null)?.failures ?? []).map((f) => f.product_id))
    const holdings = [...groups].map(([productId, rows]) => ({ productId, rows, value: computeHoldings(rows) }))
      .filter(({ value }) => value.netQty > 0)
    const rawPositions = holdings.map(({ productId, rows, value }) => {
      const product = productById.get(productId)!
      const history = priceIndex[productId] ?? []
      const latest = history.filter((p) => p.date <= today).at(-1)
      const current = latest?.price ?? (product.current_price == null ? null : Number(product.current_price))
      const oneMonth = priceOnOrBefore(priceIndex, productId, dateMinus(today, 30))
      const changes = Object.fromEntries(TIMEFRAMES.map((tf) => {
        const start = tf === "MAX" ? history[0]?.price ?? null : priceOnOrBefore(priceIndex, productId, dateMinus(today, TIMEFRAME_DAYS[tf]))
        return [tf, start && current != null ? (current - start) / start : null]
      })) as Position["valueChangePct"]
      const momentum = computeMomentum7d(priceIndex, productId, today)
      const realPoints = history.filter((p) => p.date >= dateMinus(today, 30) && p.date <= today).length
      const signal = classifyExitReviewSignal({ windowPct: changes["1M"] == null ? null : changes["1M"] * 100, momentum7dPct: momentum, windowDays: 30, realPoints, staleDays: latest ? daysBetween(latest.date, today) : null })
      const ath = computeTrackedAth(priceIndex, productId, current)
      return { productId, rows, value, product, current, latest, changes, signal, ath, marketValue: current == null ? 0 : current * value.netQty }
    })
    const totalValueDollars = rawPositions.reduce((sum, p) => sum + p.marketValue, 0)
    const positions: Position[] = rawPositions.map((p) => {
      const category = effectiveCategory(p.product.name, p.product.category_override)
      return {
        productId: p.productId, name: p.product.name, setId: p.product.set_id, setName: p.product.set_name,
        tcgplayerId: p.product.tcgplayer_id, category: category.category, categorySource: category.source, quantity: p.value.netQty,
        currentUnitPrice: toCentsOrNull(p.current), marketValue: toCents(p.marketValue),
        costBasis: toCents(p.value.costBasisRemaining), avgUnitCost: toCents(p.value.avgCostRemaining),
        unrealizedPnl: toCents(p.marketValue - p.value.costBasisRemaining),
        unrealizedPnlPct: p.value.costBasisRemaining ? (p.marketValue - p.value.costBasisRemaining) / p.value.costBasisRemaining : null,
        realizedPnl: toCents(p.value.realizedPnL), valueChangePct: p.changes, signal: p.signal,
        priceStatus: p.current == null ? "unknown" : failures.has(p.productId) ? "stale" : "ok",
        lastPricedAt: p.latest?.date ?? null, portfolioShare: totalValueDollars ? p.marketValue / totalValueDollars : 0,
        holdingPeriod: computeHoldingPeriod(p.value.lots, p.current, today),
        trackedAth: toCentsOrNull(p.ath?.price), trackedAthDate: p.ath?.date ?? null,
        drawdownFromAthPct: p.ath?.drawdownPct ?? null,
      }
    })
    const allHoldings = [...groups.values()].map(computeHoldings)
    const summary: PortfolioSummary = {
      totalValue: toCents(totalValueDollars), costBasis: toCents(allHoldings.reduce((s,h) => s+h.costBasisRemaining,0)),
      unrealizedPnl: toCents(totalValueDollars-allHoldings.reduce((s,h) => s+h.costBasisRemaining,0)),
      unrealizedPnlPct: allHoldings.reduce((s,h) => s+h.costBasisRemaining,0) ? (totalValueDollars-allHoldings.reduce((s,h) => s+h.costBasisRemaining,0))/allHoldings.reduce((s,h) => s+h.costBasisRemaining,0) : null,
      realizedPnl: toCents(allHoldings.reduce((s,h) => s+h.realizedPnL,0)),
      netCashFlow: toCents(allHoldings.reduce((s,h) => s-h.totalInvested+h.totalProceeds,0)),
      totalInvested: toCents(allHoldings.reduce((s,h) => s+h.totalInvested,0)), totalProceeds: toCents(allHoldings.reduce((s,h) => s+h.totalProceeds,0)),
      positionCount: positions.length, unitCount: positions.reduce((s,p) => s+p.quantity,0),
      pricedPositionCount: positions.filter((p)=>p.priceStatus==="ok").length, stalePositionCount: positions.filter((p)=>p.priceStatus==="stale").length,
      unknownPositionCount: positions.filter((p)=>p.priceStatus==="unknown").length,
    }
    const allocationFor = (key: "set" | "category") => [...positions.reduce((map,p) => {
      const bucketKey = key === "set" ? p.setId : p.category
      const old = map.get(bucketKey) ?? { key: bucketKey, label: key === "set" ? p.setName : p.category, value: 0, share: 0, positionCount: 0 }
      old.value += p.marketValue; old.positionCount += 1; map.set(bucketKey, old); return map
    }, new Map<string, { key:string; label:string; value:number; share:number; positionCount:number }>()).values()].map((b)=>({...b,share:summary.totalValue?b.value/summary.totalValue:0})).sort((a,b)=>b.value-a.value)
    const allocation: PortfolioAllocation = { bySet: allocationFor("set"), byCategory: allocationFor("category"), totalValue: summary.totalValue }
    const actualByDate = new Map<string, number>()
    const earliest = txs.map(t=>t.transaction_date).sort()[0] ?? today
    for (const date of daterange(earliest, today)) {
      let total = 0
      for (const [productId, rows] of groups) { const h=computeHoldingsAsOf(rows,date); const price=priceOnOrBefore(priceIndex,productId,date); if(h.netQty>0 && price!=null) total += h.netQty*price }
      actualByDate.set(date,total)
    }
    const projectedRows = await computeProjectedSnapshots(opts.portfolioId ? [opts.portfolioId] : undefined)
    const projectedByDate = new Map<string,number>()
    for(const row of projectedRows) projectedByDate.set(row.snapshot_date,(projectedByDate.get(row.snapshot_date)??0)+Number(row.total_value))
    const performance = buildPerformance(actualByDate,projectedByDate,today,opts.timeframe??"1M")
    const portfolioNames = new Map((portfolios??[]).map(p=>[p.id,p.name]))
    const activity: {items:ActivityItem[];totalCount:number} = { totalCount:txs.length, items:[...txs].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date)||b.created_at.localeCompare(a.created_at)).slice(0,50).map(tx=>({
      transactionId:tx.id,portfolioId:tx.portfolio_id,portfolioName:portfolioNames.get(tx.portfolio_id)??"Unknown",productId:tx.product_id,
      productName:tx.product?.name??tx.product_id,setName:tx.product?.set_name??"",type:tx.type,quantity:tx.quantity,unitPrice:toCents(tx.price),totalAmount:toCents(Number(tx.price)*tx.quantity),date:tx.transaction_date,
      realizedPnl:tx.type==="sell"?toCents(computeHoldings(groups.get(tx.product_id)?.filter(t=>t.transaction_date<=tx.transaction_date)??[]).realizedPnL):null,notes:tx.notes,
    })) }
    if (positions.length) await supabase.from("snapshot_positions").insert(positions.map((position)=>({snapshot_id:snapshotId,product_id:position.productId,position})))
    const { error: publishError } = await supabase.from("analytics_snapshots").update({
      status:"published",completed_at:new Date().toISOString(),products_requested:productIds.length,products_updated:positions.length,
      products_failed:positions.filter(p=>p.priceStatus!=="ok").length,summary,performance,allocation,activity,
    }).eq("id",snapshotId).eq("status","pending")
    if(publishError) throw new Error(publishError.message)
    return snapshotId
  } catch (error) {
    await supabase.from("analytics_snapshots").update({status:"failed",completed_at:new Date().toISOString(),error:error instanceof Error?error.message:String(error)}).eq("id",snapshotId)
    throw error
  }
}
