import { classifyExitReviewSignal, computeMomentum7d, daysBetween } from "@/lib/compare-series"
import {
  TIMEFRAMES,
  TIMEFRAME_DAYS,
  toCents,
  toCentsOrNull,
} from "@/lib/dashboard/contract"
import type {
  ActivityPayload,
  PortfolioAllocation,
  PortfolioPerformance,
  PortfolioSummary,
  Position,
  ProductCategory,
  Timeframe,
  ValuationBasis,
  ValueChange,
} from "@/lib/dashboard/contract"
import {
  computeHoldings,
  holdingStateByDate,
  replayHoldings,
} from "@/lib/holdings"
import { daterange, priceOnOrBefore } from "@/lib/price-lookup"
import type { PriceIndex } from "@/lib/price-lookup"
import type { Product, Transaction } from "@/lib/supabase"
import { buildActivity } from "./activity"
import { effectiveCategory } from "./categorize"
import { computeHoldingPeriod } from "./holding-period"
import { derivePriceStatus } from "./price-status"
import { computeTrackedAth } from "./tracked-ath"

export type AnalyticsProduct = Product & {
  category_override?: ProductCategory | null
}

export type AnalyticsTransaction = Transaction & {
  product?: AnalyticsProduct
}

export type AnalyticsInput = {
  today: string
  transactions: AnalyticsTransaction[]
  products: AnalyticsProduct[]
  priceIndex: PriceIndex
  portfolios: Array<{ id: string; name: string }>
  lastSyncFailures?: Array<{ product_id: string }>
  timeframe?: Timeframe
  expectedSyncWindowDays?: number
}

export type AnalyticsResult = {
  summary: PortfolioSummary
  performance: PortfolioPerformance & {
    seriesByTimeframe: Record<Timeframe, PortfolioPerformance["series"]>
  }
  allocation: PortfolioAllocation
  activity: ActivityPayload
  positions: Position[]
}

function dateMinus(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function buildPerformance(
  actualByDate: Map<string, number>,
  projectedByDate: Map<string, number>,
  basisByDate: Map<string, ValuationBasis>,
  today: string,
  requested: Timeframe
): AnalyticsResult["performance"] {
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
        actualBasis: actualByDate.get(date) == null ? null : (basisByDate.get(date) ?? "market"),
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

function buildProjectedByDate(
  transactions: AnalyticsTransaction[],
  priceIndex: PriceIndex,
  earliest: string,
  today: string
): Map<string, number> {
  const groups = new Map<string, Map<string, Transaction[]>>()
  for (const transaction of transactions) {
    const byProduct = groups.get(transaction.portfolio_id) ?? new Map<string, Transaction[]>()
    byProduct.set(transaction.product_id, [
      ...(byProduct.get(transaction.product_id) ?? []),
      transaction,
    ])
    groups.set(transaction.portfolio_id, byProduct)
  }

  const heldByPortfolio = new Map<string, Map<string, { qty: number; avgCost: number }>>()
  for (const [portfolioId, byProduct] of groups) {
    const held = new Map<string, { qty: number; avgCost: number }>()
    for (const [productId, rows] of byProduct) {
      const holdings = computeHoldings(rows)
      if (holdings.netQty > 0) {
        held.set(productId, { qty: holdings.netQty, avgCost: holdings.avgCostRemaining })
      }
    }
    if (held.size) heldByPortfolio.set(portfolioId, held)
  }

  const projectedByDate = new Map<string, number>()
  for (const date of daterange(earliest, today)) {
    for (const held of heldByPortfolio.values()) {
      let total = 0
      let any = false
      for (const [productId, holding] of held) {
        total += holding.qty * (priceOnOrBefore(priceIndex, productId, date) ?? holding.avgCost)
        any = true
      }
      if (any) projectedByDate.set(date, (projectedByDate.get(date) ?? 0) + total)
    }
  }
  return projectedByDate
}

/** Pure analytics calculation shared by production snapshots and the browser demo. */
export function computeAnalytics(input: AnalyticsInput): AnalyticsResult {
  const {
    today,
    transactions,
    products,
    priceIndex,
    portfolios,
    timeframe = "1M",
    expectedSyncWindowDays = 7,
  } = input
  const failures = new Set((input.lastSyncFailures ?? []).map((failure) => failure.product_id))
  const groups = new Map<string, Transaction[]>()
  const productById = new Map(products.map((product) => [product.id, product]))

  for (const transaction of transactions) {
    groups.set(transaction.product_id, [
      ...(groups.get(transaction.product_id) ?? []),
      transaction,
    ])
    if (transaction.product) productById.set(transaction.product_id, transaction.product)
  }

  const replayByProduct = new Map(
    [...groups].map(([productId, rows]) => [productId, replayHoldings(rows)])
  )
  const holdings = [...replayByProduct]
    .map(([productId, replay]) => ({ productId, value: replay.holdings }))
    .filter(({ value }) => value.netQty > 0)

  const rawPositions = holdings.map(({ productId, value }) => {
    const product = productById.get(productId)
    if (!product) throw new Error(`Missing product ${productId}`)
    const history = priceIndex[productId] ?? []
    const latest = history.filter((point) => point.date <= today).at(-1)
    const current =
      latest?.price ?? (product.current_price == null ? null : Number(product.current_price))
    const lastPricedAt = latest?.date ?? product.last_synced_at?.slice(0, 10) ?? null
    const changes = Object.fromEntries(
      TIMEFRAMES.map((timeframeKey) => {
        const start =
          timeframeKey === "MAX"
            ? (history[0]?.price ?? null)
            : priceOnOrBefore(
                priceIndex,
                productId,
                dateMinus(today, TIMEFRAME_DAYS[timeframeKey])
              )
        return [
          timeframeKey,
          start && current != null ? (current - start) / start : null,
        ]
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
      value,
      product,
      current,
      lastPricedAt,
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
      priceStatus: derivePriceStatus({
        currentPrice: raw.current,
        lastPricedAt: raw.lastPricedAt,
        asOfDate: today,
        failedLastSync: failures.has(raw.productId),
        expectedWindowDays: expectedSyncWindowDays,
      }),
      lastPricedAt: raw.lastPricedAt,
      portfolioShare: totalValueDollars ? raw.marketValue / totalValueDollars : 0,
      holdingPeriod: computeHoldingPeriod(raw.value.lots, raw.current, today),
      trackedAth: toCentsOrNull(raw.ath?.price),
      trackedAthDate: raw.ath?.date ?? null,
      drawdownFromAthPct: raw.ath?.drawdownPct ?? null,
    }
  })

  const allHoldings = [...replayByProduct.values()].map((replay) => replay.holdings)
  const totalCostBasis = allHoldings.reduce(
    (sum, holding) => sum + holding.costBasisRemaining,
    0
  )
  const totalRealizedPnl = allHoldings.reduce((sum, holding) => sum + holding.realizedPnL, 0)
  const netCashFlow = allHoldings.reduce(
    (sum, holding) => sum - holding.totalInvested + holding.totalProceeds,
    0
  )
  const totalInvested = allHoldings.reduce((sum, holding) => sum + holding.totalInvested, 0)
  const totalProceeds = allHoldings.reduce((sum, holding) => sum + holding.totalProceeds, 0)
  const summary: PortfolioSummary = {
    totalValue: toCents(totalValueDollars),
    costBasis: toCents(totalCostBasis),
    unrealizedPnl: toCents(totalValueDollars - totalCostBasis),
    unrealizedPnlPct: totalCostBasis
      ? (totalValueDollars - totalCostBasis) / totalCostBasis
      : null,
    realizedPnl: toCents(totalRealizedPnl),
    netCashFlow: toCents(netCashFlow),
    totalInvested: toCents(totalInvested),
    totalProceeds: toCents(totalProceeds),
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

  const earliest = transactions.map((transaction) => transaction.transaction_date).sort()[0] ?? today
  const actualDates = daterange(earliest, today)
  const actualByDate = new Map(actualDates.map((date) => [date, 0]))
  const pricedByDate = new Map(actualDates.map((date) => [date, 0]))
  const costOnlyByDate = new Map(actualDates.map((date) => [date, 0]))

  for (const [productId, replay] of replayByProduct) {
    const states = holdingStateByDate(replay.transactions, actualDates)
    for (const date of actualDates) {
      const state = states.get(date)
      if (!state || state.netQty <= 0) continue
      const price = priceOnOrBefore(priceIndex, productId, date)
      if (price != null) {
        actualByDate.set(date, (actualByDate.get(date) ?? 0) + state.netQty * price)
        pricedByDate.set(date, (pricedByDate.get(date) ?? 0) + 1)
      } else {
        actualByDate.set(
          date,
          (actualByDate.get(date) ?? 0) + state.netQty * state.avgCostRemaining
        )
        costOnlyByDate.set(date, (costOnlyByDate.get(date) ?? 0) + 1)
      }
    }
  }

  const basisByDate = new Map<string, ValuationBasis>()
  for (const date of actualDates) {
    const priced = pricedByDate.get(date) ?? 0
    const costOnly = costOnlyByDate.get(date) ?? 0
    basisByDate.set(date, costOnly === 0 ? "market" : priced === 0 ? "cost" : "partial")
  }

  const projectedByDate = buildProjectedByDate(
    transactions,
    priceIndex,
    earliest,
    today
  )
  const performance = buildPerformance(
    actualByDate,
    projectedByDate,
    basisByDate,
    today,
    timeframe
  )
  const portfolioNames = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name]))
  const activityTransactions = transactions.map((transaction) => ({
    ...transaction,
    product: transaction.product ?? productById.get(transaction.product_id),
  }))
  const activity = buildActivity(activityTransactions, portfolioNames, replayByProduct)

  return { summary, performance, allocation, activity, positions }
}
