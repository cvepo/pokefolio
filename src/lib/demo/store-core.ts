import { computeAnalytics } from "@/lib/analytics/compute"
import {
  computeInsightTransitions,
  type InsightPositionState,
} from "@/lib/analytics/insights/compute"
import { outsizedMoveState } from "@/lib/analytics/insights/outsized-move"
import type {
  DashboardPayload,
  InsightEvent,
  Position,
  Timeframe,
} from "@/lib/dashboard/contract"
import { computeHoldings, checkOversell } from "@/lib/holdings"
import { buildPriceIndex } from "@/lib/price-lookup"
import type { Transaction } from "@/lib/supabase"
import type { CompareProduct, CompareSeriesResponse } from "@/lib/compare-series"
import type {
  AddTransactionInput,
  DemoDataset,
  DemoState,
  DemoStore,
  DemoTransaction,
} from "./contract"

const STORAGE_KEY = "pokefolio:demo-state:v1"

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

function cloneTransactions(transactions: DemoTransaction[]): DemoTransaction[] {
  return transactions.map((transaction) => ({ ...transaction }))
}

function dateMinus(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function loadState(storage: StorageLike | null, seeded: DemoTransaction[]): DemoState {
  if (!storage) return { transactions: cloneTransactions(seeded), dirty: false }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { transactions: cloneTransactions(seeded), dirty: false }
    const parsed = JSON.parse(raw) as Partial<DemoState>
    if (!Array.isArray(parsed.transactions) || parsed.dirty !== true) {
      return { transactions: cloneTransactions(seeded), dirty: false }
    }
    return { transactions: cloneTransactions(parsed.transactions), dirty: true }
  } catch {
    return { transactions: cloneTransactions(seeded), dirty: false }
  }
}

function stateFor(position: Position, updatedAt: string): InsightPositionState {
  return {
    productId: position.productId,
    lastSignal: position.signal,
    lastOutsizedMoveState: outsizedMoveState(position.valueChangePct["1M"]),
    lastConcentrationState: position.portfolioShare >= 0.2,
    lastDrawdownState:
      position.drawdownFromAthPct != null && position.drawdownFromAthPct <= -0.15,
    updatedAt,
  }
}

export function createDemoStore(
  dataset: DemoDataset,
  options: {
    storage?: StorageLike | null
    randomUUID?: () => string
  } = {}
): DemoStore {
  const storage = options.storage === undefined ? browserStorage() : options.storage
  const randomUUID =
    options.randomUUID ??
    (() =>
      globalThis.crypto?.randomUUID?.() ??
      `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const products = dataset.catalog.map((product) => ({
    ...product,
    last_synced_at: product.current_price == null ? null : `${dataset.asOf}T12:00:00.000Z`,
  }))
  const priceIndex = buildPriceIndex(
    dataset.priceHistory.flatMap((series) =>
      series.dates.map((snapshot_date, index) => ({
        product_id: series.productId,
        snapshot_date,
        price: series.prices[index],
      }))
    )
  )
  let currentState = loadState(storage, dataset.transactions)

  const persist = () => {
    if (!storage) return
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(currentState))
    } catch {
      // Browser storage can be disabled or full. The in-memory sandbox remains usable.
    }
  }

  const analyticsFor = (
    transactions: DemoTransaction[],
    portfolioId: string | undefined,
    timeframe: Timeframe,
    today = dataset.asOf
  ) => {
    const scoped = portfolioId
      ? transactions.filter((transaction) => transaction.portfolio_id === portfolioId)
      : transactions
    return computeAnalytics({
      today,
      transactions: scoped,
      products,
      priceIndex,
      portfolios: dataset.portfolios,
      timeframe,
      expectedSyncWindowDays: 7,
    })
  }

  const insightEvents = (
    positions: Position[],
    portfolioId: string | undefined,
    timeframe: Timeframe
  ): InsightEvent[] => {
    const previousDate = dateMinus(dataset.asOf, 7)
    const previousTransactions = dataset.transactions.filter(
      (transaction) => transaction.transaction_date <= previousDate
    )
    const previous = analyticsFor(
      previousTransactions,
      portfolioId,
      timeframe,
      previousDate
    )
    const at = `${dataset.asOf}T12:00:00.000Z`
    const computed = computeInsightTransitions({
      snapshotId: `demo-${dataset.asOf}`,
      positions,
      at,
      previousStates: previous.positions.map((position) =>
        stateFor(position, `${previousDate}T12:00:00.000Z`)
      ),
    })
    const positionById = new Map(positions.map((position) => [position.productId, position]))
    return computed.events.map((event) => {
      const position = positionById.get(event.entityId)
      const { category, headline, ...payload } = event.payload
      return {
        id: event.dedupeKey,
        type: event.type,
        category,
        state: event.state,
        severity: event.severity,
        entityId: event.entityId,
        entityName: position?.name ?? event.entityId,
        setName: position?.setName ?? "",
        headline,
        detail: null,
        triggeredAt: event.triggeredAt,
        resolvedAt: event.resolvedAt,
        seenAt: null,
        snapshotId: event.snapshotId,
        dedupeKey: event.dedupeKey,
        payload,
      }
    })
  }

  return {
    today: dataset.asOf,

    get state() {
      return {
        transactions: cloneTransactions(currentState.transactions),
        dirty: currentState.dirty,
      }
    },

    getDashboard(portfolioId, timeframe) {
      const analytics = analyticsFor(currentState.transactions, portfolioId, timeframe)
      const events = insightEvents(analytics.positions, portfolioId, timeframe)
      const asOf = `${dataset.asOf}T12:00:00.000Z`
      const data: DashboardPayload = {
        summary: analytics.summary,
        performance: analytics.performance,
        positions: {
          positions: analytics.positions,
          heatmapColorDomain: { min: -0.25, max: 0.25 },
        },
        allocation: analytics.allocation,
        activity: analytics.activity,
        insights: {
          events: events.sort((left, right) => right.severity - left.severity),
          activeCount: events.filter((event) => event.state === "active").length,
          unseenCount: events.filter(
            (event) => event.state === "active" && event.seenAt == null
          ).length,
          totalCount: events.length,
        },
        sync: {
          state: analytics.summary.unknownPositionCount ? "partially_priced" : "fresh",
          lastAttemptedAt: asOf,
          lastAttemptStatus: analytics.summary.unknownPositionCount ? "partial" : "success",
          lastSuccessfulAt: asOf,
          productsTotal: analytics.summary.positionCount,
          productsSynced: analytics.summary.pricedPositionCount,
          productsFailed:
            analytics.summary.stalePositionCount + analytics.summary.unknownPositionCount,
          failures: [],
          stalePositionCount: analytics.summary.stalePositionCount,
          nextScheduledDescription: null,
        },
      }
      return { asOf, snapshotId: `demo-${dataset.asOf}`, currency: "USD", data }
    },

    getPortfolios() {
      return dataset.portfolios.map((portfolio) => ({ ...portfolio }))
    },

    getProduct(productId) {
      const product = dataset.catalog.find((candidate) => candidate.id === productId)
      return product ? { ...product } : null
    },

    searchProducts(query, limit = 20) {
      const normalized = query.trim().toLocaleLowerCase()
      if (!normalized || limit <= 0) return []
      return dataset.catalog
        .filter((product) =>
          `${product.name}\n${product.set_name}`.toLocaleLowerCase().includes(normalized)
        )
        .slice(0, limit)
        .map((product) => ({ ...product }))
    },

    getTransactions(portfolioId) {
      return currentState.transactions
        .filter((transaction) => !portfolioId || transaction.portfolio_id === portfolioId)
        .sort(
          (left, right) =>
            right.transaction_date.localeCompare(left.transaction_date) ||
            right.created_at.localeCompare(left.created_at)
        )
        .map((transaction) => ({ ...transaction }))
    },

    addTransaction(input: AddTransactionInput) {
      if (!dataset.portfolios.some((portfolio) => portfolio.id === input.portfolioId)) {
        return { ok: false, error: "Portfolio not found." }
      }
      if (!dataset.catalog.some((product) => product.id === input.productId)) {
        return { ok: false, error: "Product not found." }
      }
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        return { ok: false, error: "Quantity must be a positive whole number." }
      }
      if (!Number.isFinite(input.price) || input.price <= 0) {
        return { ok: false, error: "Price must be greater than zero." }
      }
      if (input.type === "sell") {
        const existing = currentState.transactions.filter(
          (transaction) =>
            transaction.portfolio_id === input.portfolioId &&
            transaction.product_id === input.productId
        ) as Transaction[]
        const error = checkOversell(existing, input.quantity)
        if (error) return { ok: false, error }
      }

      const transaction: DemoTransaction = {
        id: randomUUID(),
        portfolio_id: input.portfolioId,
        product_id: input.productId,
        type: input.type,
        quantity: input.quantity,
        price: input.price,
        transaction_date: input.date,
        notes: input.notes ?? null,
        created_at: `${input.date}T12:00:00.000Z`,
      }
      currentState = {
        transactions: [...currentState.transactions, transaction],
        dirty: true,
      }
      persist()
      return { ok: true }
    },

    deleteTransaction(transactionId) {
      const transactions = currentState.transactions.filter(
        (transaction) => transaction.id !== transactionId
      )
      if (transactions.length === currentState.transactions.length) return
      currentState = { transactions, dirty: true }
      persist()
    },

    getCompareSeries(): CompareSeriesResponse {
      // Same shape /api/compare/series returns, built from the frozen history
      // so the real ComparisonChart renders without a server round trip.
      const byProduct = new Map<string, DemoTransaction[]>()
      for (const transaction of currentState.transactions) {
        const list = byProduct.get(transaction.product_id) ?? []
        list.push(transaction)
        byProduct.set(transaction.product_id, list)
      }

      const seriesById = new Map(dataset.priceHistory.map((series) => [series.productId, series]))
      const products: CompareProduct[] = []

      for (const [productId, transactions] of byProduct) {
        const holdings = computeHoldings(transactions as unknown as Transaction[])
        // Compare is about what you still hold; a fully closed position has no
        // position line to draw.
        if (holdings.netQty <= 0) continue

        const product = dataset.catalog.find((entry) => entry.id === productId)
        const series = seriesById.get(productId)
        if (!product || !series?.dates.length) continue

        const history = series.dates.map(
          (date, index) => [date, series.prices[index]] as [string, number]
        )
        const lastSnapshotDate = series.dates[series.dates.length - 1] ?? null
        const currentPrice =
          series.prices[series.prices.length - 1] ?? product.current_price ?? 0

        products.push({
          product_id: productId,
          name: product.name,
          set_name: product.set_name,
          tcgplayer_id: product.tcgplayer_id,
          qty: holdings.netQty,
          avg_cost: holdings.avgCostRemaining,
          current_price: currentPrice,
          current_price_source: "snapshot",
          last_snapshot_date: lastSnapshotDate,
          history,
        })
      }

      products.sort((a, b) => b.qty * b.current_price - a.qty * a.current_price)

      const allDates = products.flatMap((product) => product.history.map(([date]) => date))
      const earliest = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : dataset.asOf

      return {
        products,
        meta: {
          as_of_date: dataset.asOf,
          earliest_date: earliest,
          products_current: products.length,
          products_total: products.length,
          total_starting_value: products.reduce((sum, product) => {
            const first = product.history[0]?.[1] ?? 0
            return sum + first * product.qty
          }, 0),
        },
      }
    },

    reset() {
      currentState = { transactions: cloneTransactions(dataset.transactions), dirty: false }
      try {
        storage?.removeItem(STORAGE_KEY)
      } catch {
        // The in-memory reset still succeeds when storage is unavailable.
      }
    },
  }
}
