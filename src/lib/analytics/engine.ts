import { classifyExitReviewSignal, computeMomentum7d, daysBetween } from "@/lib/compare-series"
import {
  TIMEFRAMES,
  TIMEFRAME_DAYS,
  toCents,
  toCentsOrNull,
} from "@/lib/dashboard/contract"
import type {
  PortfolioAllocation,
  PortfolioPerformance,
  PortfolioSummary,
  Position,
  ProductCategory,
  Timeframe,
  ValueChange,
} from "@/lib/dashboard/contract"
import { computeHoldings, computeHoldingsAsOf, replayHoldings } from "@/lib/holdings"
import {
  buildPriceIndex,
  daterange,
  fetchAllPriceSnapshots,
  priceOnOrBefore,
} from "@/lib/price-lookup"
import { computeProjectedSnapshots } from "@/lib/projected-snapshots"
import type { Product, Transaction } from "@/lib/supabase"
import { supabase } from "@/lib/supabase-server"
import { buildActivity } from "./activity"
import { effectiveCategory } from "./categorize"
import { computeHoldingPeriod } from "./holding-period"
import { persistInsightTransitions } from "./insights/persistence"
import { computeTrackedAth } from "./tracked-ath"

type ProductRow = Product & { category_override?: ProductCategory | null }
type Source = { syncRunId?: string; transactionId?: string }

function dateMinus(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function buildPerformance(
  actualByDate: Map<string, number>,
  projectedByDate: Map<string, number>,
  today: string,
  requested: Timeframe
): PortfolioPerformance & {
  seriesByTimeframe: Record<Timeframe, PortfolioPerformance["series"]>
} {
  const dates = [...new Set([...actualByDate.keys(), ...projectedByDate.keys()])].sort()
  const earliest = dates[0] ?? today
  const latestActualDate = [...actualByDate.keys()].sort().at(-1) ?? ""
  const endValue = actualByDate.get(today) ?? actualByDate.get(latestActualDate) ?? 0
  const timeframes: ValueChange[] = TIMEFRAMES.map((timeframe) => {
    const days = TIMEFRAME_DAYS[timeframe]
    const wanted = days === Infinity ? earliest : dateMinus(today, days)
    const startDate =
      [...actualByDate.keys()].filter((date) => date >= wanted && date <= today).sort()[0] ?? null
    const startValue = startDate ? (actualByDate.get(startDate) ?? null) : null

    return {
      timeframe,
      startDate,
      endDate: today,
      startValue: startValue == null ? null : toCents(startValue),
      endValue: toCents(endValue),
      valueChangeAbs: startValue == null ? null : toCents(endValue - startValue),
      valueChangePct: startValue ? (endValue - startValue) / startValue : null,
      hasFullHistory: startDate != null && startDate <= wanted,
    }
  })

  const seriesFor = (timeframe: Timeframe) => {
    const cutoff =
      timeframe === "MAX" ? earliest : dateMinus(today, TIMEFRAME_DAYS[timeframe])
    return dates
      .filter((date) => date >= cutoff && date <= today)
      .map((date) => ({
        date,
        actual: toCentsOrNull(actualByDate.get(date)),
        projected: toCentsOrNull(projectedByDate.get(date)),
      }))
  }

  return {
    timeframes,
    seriesTimeframe: requested,
    series: seriesFor(requested),
    seriesByTimeframe: Object.fromEntries(
      TIMEFRAMES.map((timeframe) => [timeframe, seriesFor(timeframe)])
    ) as Record<Timeframe, PortfolioPerformance["series"]>,
  }
}

/** Recomputes from stored domain data only. This function never calls a pricing API. */
export async function publishAnalyticsSnapshot(
  opts: {
    portfolioId?: string
    timeframe?: Timeframe
    source?: Source
    asOf?: Date
  } = {}
): Promise<string> {
  const startedAt = new Date().toISOString()
  const asOf = opts.asOf ?? new Date()
  const today = asOf.toISOString().slice(0, 10)

  // Readers only select published rows. Keeping the snapshot pending until all
  // child rows and payloads exist makes the final status change the atomic
  // visibility boundary for a complete analytics version.
  const { data: pending, error: startError } = await supabase
    .from("analytics_snapshots")
    .insert({
      as_of: asOf.toISOString(),
      scope_portfolio_id: opts.portfolioId ?? null,
      source_sync_run_id: opts.source?.syncRunId ?? null,
      source_transaction_id: opts.source?.transactionId ?? null,
      status: "pending",
      started_at: startedAt,
    })
    .select("id")
    .single()
  if (startError || !pending) {
    throw new Error(startError?.message ?? "Could not start analytics snapshot")
  }
  const snapshotId = (pending as { id: string }).id

  try {
    let txQuery = supabase.from("transactions").select("*, product:products(*)")
    if (opts.portfolioId) txQuery = txQuery.eq("portfolio_id", opts.portfolioId)

    const [{ data: txRows, error: txError }, { data: portfolios }, { data: lastRun }] =
      await Promise.all([
        txQuery,
        supabase.from("portfolios").select("id,name"),
        supabase
          .from("sync_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
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
    const failures = new Set(
      (
        (lastRun as { failures?: Array<{ product_id: string }> } | null)?.failures ?? []
      ).map((failure) => failure.product_id)
    )
    const replayByProduct = new Map(
      [...groups].map(([productId, rows]) => [productId, replayHoldings(rows)])
    )
    const holdings = [...groups]
      .map(([productId, rows]) => ({ productId, rows, value: computeHoldings(rows) }))
      .filter(({ value }) => value.netQty > 0)

    const rawPositions = holdings.map(({ productId, rows, value }) => {
      const product = productById.get(productId)!
      const history = priceIndex[productId] ?? []
      const latest = history.filter((point) => point.date <= today).at(-1)
      const current =
        latest?.price ?? (product.current_price == null ? null : Number(product.current_price))
      const changes = Object.fromEntries(
        TIMEFRAMES.map((timeframe) => {
          const start =
            timeframe === "MAX"
              ? (history[0]?.price ?? null)
              : priceOnOrBefore(
                  priceIndex,
                  productId,
                  dateMinus(today, TIMEFRAME_DAYS[timeframe])
                )
          return [timeframe, start && current != null ? (current - start) / start : null]
        })
      ) as Position["valueChangePct"]
      const momentum = computeMomentum7d(priceIndex, productId, today)
      const realPoints = history.filter(
        (point) => point.date >= dateMinus(today, 30) && point.date <= today
      ).length
      const signal = classifyExitReviewSignal({
        windowPct: changes["1M"] == null ? null : changes["1M"] * 100,
        momentum7dPct: momentum,
        windowDays: 30,
        realPoints,
        staleDays: latest ? daysBetween(latest.date, today) : null,
      })
      const ath = computeTrackedAth(priceIndex, productId, current)

      return {
        productId,
        rows,
        value,
        product,
        current,
        latest,
        changes,
        signal,
        ath,
        marketValue: current == null ? 0 : current * value.netQty,
      }
    })
    const totalValueDollars = rawPositions.reduce(
      (sum, position) => sum + position.marketValue,
      0
    )
    const positions: Position[] = rawPositions.map((raw) => {
      const category = effectiveCategory(raw.product.name, raw.product.category_override)

      return {
        productId: raw.productId,
        name: raw.product.name,
        setId: raw.product.set_id,
        setName: raw.product.set_name,
        tcgplayerId: raw.product.tcgplayer_id,
        category: category.category,
        categorySource: category.source,
        quantity: raw.value.netQty,
        currentUnitPrice: toCentsOrNull(raw.current),
        marketValue: toCents(raw.marketValue),
        costBasis: toCents(raw.value.costBasisRemaining),
        avgUnitCost: toCents(raw.value.avgCostRemaining),
        unrealizedPnl: toCents(raw.marketValue - raw.value.costBasisRemaining),
        unrealizedPnlPct: raw.value.costBasisRemaining
          ? (raw.marketValue - raw.value.costBasisRemaining) / raw.value.costBasisRemaining
          : null,
        realizedPnl: toCents(raw.value.realizedPnL),
        valueChangePct: raw.changes,
        signal: raw.signal,
        // A failed lookup uses the last known-good price and must remain
        // distinguishable from a position with a current market observation.
        priceStatus:
          raw.current == null ? "unknown" : failures.has(raw.productId) ? "stale" : "ok",
        lastPricedAt: raw.latest?.date ?? null,
        portfolioShare: totalValueDollars ? raw.marketValue / totalValueDollars : 0,
        holdingPeriod: computeHoldingPeriod(raw.value.lots, raw.current, today),
        trackedAth: toCentsOrNull(raw.ath?.price),
        trackedAthDate: raw.ath?.date ?? null,
        drawdownFromAthPct: raw.ath?.drawdownPct ?? null,
      }
    })

    const allHoldings = [...groups.values()].map(computeHoldings)
    const summary: PortfolioSummary = {
      totalValue: toCents(totalValueDollars),
      costBasis: toCents(
        allHoldings.reduce((sum, holding) => sum + holding.costBasisRemaining, 0)
      ),
      unrealizedPnl: toCents(
        totalValueDollars -
          allHoldings.reduce((sum, holding) => sum + holding.costBasisRemaining, 0)
      ),
      unrealizedPnlPct: allHoldings.reduce(
        (sum, holding) => sum + holding.costBasisRemaining,
        0
      )
        ? (totalValueDollars -
            allHoldings.reduce((sum, holding) => sum + holding.costBasisRemaining, 0)) /
          allHoldings.reduce((sum, holding) => sum + holding.costBasisRemaining, 0)
        : null,
      realizedPnl: toCents(
        allHoldings.reduce((sum, holding) => sum + holding.realizedPnL, 0)
      ),
      netCashFlow: toCents(
        allHoldings.reduce(
          (sum, holding) => sum - holding.totalInvested + holding.totalProceeds,
          0
        )
      ),
      totalInvested: toCents(
        allHoldings.reduce((sum, holding) => sum + holding.totalInvested, 0)
      ),
      totalProceeds: toCents(
        allHoldings.reduce((sum, holding) => sum + holding.totalProceeds, 0)
      ),
      positionCount: positions.length,
      unitCount: positions.reduce((sum, position) => sum + position.quantity, 0),
      pricedPositionCount: positions.filter((position) => position.priceStatus === "ok").length,
      stalePositionCount: positions.filter((position) => position.priceStatus === "stale").length,
      unknownPositionCount: positions.filter((position) => position.priceStatus === "unknown").length,
    }

    const allocationFor = (key: "set" | "category") =>
      [
        ...positions
          .reduce((map, position) => {
            const bucketKey = key === "set" ? position.setId : position.category
            const old = map.get(bucketKey) ?? {
              key: bucketKey,
              label: key === "set" ? position.setName : position.category,
              value: 0,
              share: 0,
              positionCount: 0,
            }
            old.value += position.marketValue
            old.positionCount += 1
            map.set(bucketKey, old)
            return map
          }, new Map<string, { key: string; label: string; value: number; share: number; positionCount: number }>())
          .values(),
      ]
        .map((bucket) => ({
          ...bucket,
          share: summary.totalValue ? bucket.value / summary.totalValue : 0,
        }))
        .sort((a, b) => b.value - a.value)
    const allocation: PortfolioAllocation = {
      bySet: allocationFor("set"),
      byCategory: allocationFor("category"),
      totalValue: summary.totalValue,
    }

    const actualByDate = new Map<string, number>()
    const earliest = txs.map((tx) => tx.transaction_date).sort()[0] ?? today
    for (const date of daterange(earliest, today)) {
      let total = 0
      for (const [productId, rows] of groups) {
        const holding = computeHoldingsAsOf(rows, date)
        const price = priceOnOrBefore(priceIndex, productId, date)
        if (holding.netQty > 0 && price != null) total += holding.netQty * price
      }
      actualByDate.set(date, total)
    }

    const projectedRows = await computeProjectedSnapshots(
      opts.portfolioId ? [opts.portfolioId] : undefined
    )
    const projectedByDate = new Map<string, number>()
    for (const row of projectedRows) {
      projectedByDate.set(
        row.snapshot_date,
        (projectedByDate.get(row.snapshot_date) ?? 0) + Number(row.total_value)
      )
    }
    const performance = buildPerformance(
      actualByDate,
      projectedByDate,
      today,
      opts.timeframe ?? "1M"
    )

    const portfolioNames = new Map(
      (portfolios ?? []).map((portfolio) => [portfolio.id, portfolio.name])
    )
    const activity = buildActivity(txs, portfolioNames, replayByProduct)

    if (positions.length) {
      await supabase.from("snapshot_positions").insert(
        positions.map((position) => ({
          snapshot_id: snapshotId,
          product_id: position.productId,
          position,
        }))
      )
    }

    // Transition state is global per product today. Only the combined scope
    // may advance it; otherwise each portfolio publish could consume another
    // scope's transition and make insight generation depend on publish order.
    const insightsCreated = opts.portfolioId
      ? 0
      : await persistInsightTransitions(snapshotId, positions, asOf.toISOString())

    // This is deliberately the last successful write. Published readers cannot
    // observe the positions or events above until their owning snapshot crosses
    // this status boundary.
    const { error: publishError } = await supabase
      .from("analytics_snapshots")
      .update({
        status: "published",
        completed_at: new Date().toISOString(),
        products_requested: productIds.length,
        products_updated: positions.length,
        products_failed: positions.filter((position) => position.priceStatus !== "ok").length,
        insights_created: insightsCreated,
        summary,
        performance,
        allocation,
        activity,
      })
      .eq("id", snapshotId)
      .eq("status", "pending")
    if (publishError) throw new Error(publishError.message)

    return snapshotId
  } catch (error) {
    await supabase
      .from("analytics_snapshots")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", snapshotId)
    throw error
  }
}
