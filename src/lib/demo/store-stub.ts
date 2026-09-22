/**
 * TEMPORARY stub — delete at integration.
 *
 * The parallel demo-data agent owns `src/lib/demo/store.ts` and
 * `src/lib/demo/dataset.ts`. This file stands in so the UI worktree can
 * compile and click through until merge. Swap is a one-line change in
 * `get-store.ts`.
 */

import type {
  ActivityItem,
  ApiEnvelope,
  DashboardPayload,
  PortfolioAllocation,
  Position,
  Timeframe,
} from "@/lib/dashboard/contract"
import { toCents } from "@/lib/dashboard/contract"
import type {
  AddTransactionInput,
  DemoPortfolio,
  DemoProduct,
  DemoStore,
  DemoTransaction,
} from "@/lib/demo/contract"

const TODAY = "2026-08-15"
const AS_OF = "2026-08-15T12:00:00Z"
const SNAPSHOT_ID = "snap_demo_stub"

const PORTFOLIOS: DemoPortfolio[] = [
  {
    id: "pf_main",
    name: "Main collection",
    description: "Sample sealed products for the public demo",
    created_at: "2025-11-01T00:00:00Z",
  },
  {
    id: "pf_specs",
    name: "Specs",
    description: "Smaller speculative holds",
    created_at: "2026-01-15T00:00:00Z",
  },
]

const CATALOG: DemoProduct[] = [
  {
    id: "prod_surging_etb",
    name: "Surging Sparks Elite Trainer Box",
    set_id: "set_sv8",
    set_name: "Surging Sparks",
    tcgplayer_id: "566001",
    variant_id: "var_nm",
    current_price: 52.0,
  },
  {
    id: "prod_prismatic_etb",
    name: "Prismatic Evolutions Elite Trainer Box",
    set_id: "set_sv8pt5",
    set_name: "Prismatic Evolutions",
    tcgplayer_id: "566890",
    variant_id: "var_nm",
    current_price: 89.0,
  },
  {
    id: "prod_blooming",
    name: "Blooming Waters Premium Collection",
    set_id: "set_sv7",
    set_name: "Stellar Crown",
    tcgplayer_id: "554433",
    variant_id: "var_nm",
    current_price: 198.5,
  },
  {
    id: "prod_v_heroes",
    name: "V Heroes Tin [Espeon V]",
    set_id: "set_swsh",
    set_name: "Sword & Shield",
    tcgplayer_id: "235001",
    variant_id: "var_nm",
    current_price: 42.0,
  },
  {
    id: "prod_paldean_bundle",
    name: "Paldean Fates Booster Bundle",
    set_id: "set_sv4pt5",
    set_name: "Paldean Fates",
    tcgplayer_id: "541100",
    variant_id: "var_nm",
    current_price: 38.5,
  },
  {
    id: "prod_151_upc",
    name: "Scarlet & Violet—151 Ultra-Premium Collection",
    set_id: "set_sv3pt5",
    set_name: "151",
    tcgplayer_id: "517890",
    variant_id: "var_nm",
    current_price: 165.0,
  },
  {
    id: "prod_catalog_only",
    name: "Twilight Masquerade Booster Box",
    set_id: "set_sv6",
    set_name: "Twilight Masquerade",
    tcgplayer_id: "548200",
    variant_id: "var_nm",
    current_price: 124.0,
  },
  {
    id: "prod_unpriced",
    name: "Local Shop Mystery Case",
    set_id: "set_misc",
    set_name: "Miscellaneous",
    tcgplayer_id: null,
    variant_id: "var_nm",
    current_price: null,
  },
]

const SEED_TRANSACTIONS: DemoTransaction[] = [
  {
    id: "tx_seed_1",
    portfolio_id: "pf_main",
    product_id: "prod_surging_etb",
    type: "buy",
    quantity: 8,
    price: 44,
    transaction_date: "2025-12-01",
    notes: null,
    created_at: "2025-12-01T10:00:00Z",
  },
  {
    id: "tx_seed_2",
    portfolio_id: "pf_main",
    product_id: "prod_prismatic_etb",
    type: "buy",
    quantity: 5,
    price: 75,
    transaction_date: "2026-02-10",
    notes: null,
    created_at: "2026-02-10T10:00:00Z",
  },
  {
    id: "tx_seed_3",
    portfolio_id: "pf_main",
    product_id: "prod_blooming",
    type: "buy",
    quantity: 3,
    price: 230,
    transaction_date: "2026-02-10",
    notes: null,
    created_at: "2026-02-10T11:00:00Z",
  },
  {
    id: "tx_seed_4",
    portfolio_id: "pf_main",
    product_id: "prod_v_heroes",
    type: "buy",
    quantity: 6,
    price: 35,
    transaction_date: "2025-09-01",
    notes: null,
    created_at: "2025-09-01T10:00:00Z",
  },
  {
    id: "tx_seed_5",
    portfolio_id: "pf_main",
    product_id: "prod_v_heroes",
    type: "sell",
    quantity: 2,
    price: 45,
    transaction_date: "2026-04-01",
    notes: "Trimmed position",
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "tx_seed_6",
    portfolio_id: "pf_specs",
    product_id: "prod_paldean_bundle",
    type: "buy",
    quantity: 10,
    price: 32,
    transaction_date: "2026-03-01",
    notes: null,
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "tx_seed_7",
    portfolio_id: "pf_main",
    product_id: "prod_151_upc",
    type: "buy",
    quantity: 2,
    price: 140,
    transaction_date: "2025-11-20",
    notes: null,
    created_at: "2025-11-20T10:00:00Z",
  },
]

type OpenLot = { qty: number; price: number; date: string }

function heldQty(txs: DemoTransaction[], productId: string, portfolioId?: string): number {
  let qty = 0
  for (const t of txs) {
    if (t.product_id !== productId) continue
    if (portfolioId && t.portfolio_id !== portfolioId) continue
    qty += t.type === "buy" ? t.quantity : -t.quantity
  }
  return qty
}

/** Minimal FIFO for oversell checks and realized P/L in the stub. */
function fifoRealize(
  buys: OpenLot[],
  sellQty: number,
  sellPrice: number
): { lots: OpenLot[]; realized: number } | { error: string } {
  let remaining = sellQty
  let realized = 0
  const lots = buys.map((l) => ({ ...l }))
  for (const lot of lots) {
    if (remaining <= 0) break
    const take = Math.min(lot.qty, remaining)
    realized += (sellPrice - lot.price) * take
    lot.qty -= take
    remaining -= take
  }
  if (remaining > 0) {
    return { error: `Cannot sell ${sellQty}: only ${sellQty - remaining} units held` }
  }
  return { lots: lots.filter((l) => l.qty > 0), realized }
}

function openLotsFor(
  txs: DemoTransaction[],
  productId: string,
  portfolioId?: string
): { lots: OpenLot[]; realized: number } {
  const relevant = txs
    .filter((t) => t.product_id === productId && (!portfolioId || t.portfolio_id === portfolioId))
    .slice()
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.created_at.localeCompare(b.created_at))

  let lots: OpenLot[] = []
  let realized = 0
  for (const t of relevant) {
    if (t.type === "buy") {
      lots.push({ qty: t.quantity, price: t.price, date: t.transaction_date })
    } else {
      const result = fifoRealize(lots, t.quantity, t.price)
      if ("error" in result) {
        // Seed data is consistent; visitor oversells are rejected before we get here.
        lots = []
      } else {
        lots = result.lots
        realized += result.realized
      }
    }
  }
  return { lots, realized }
}

function nullChangeMap(
  overrides: Partial<Record<Timeframe, number | null>> = {}
): Position["valueChangePct"] {
  return {
    "7D": null,
    "1M": null,
    "3M": null,
    "6M": null,
    "1Y": null,
    MAX: null,
    ...overrides,
  }
}

function buildPositions(
  txs: DemoTransaction[],
  portfolioId: string | undefined
): Position[] {
  const productIds = new Set(
    txs
      .filter((t) => !portfolioId || t.portfolio_id === portfolioId)
      .map((t) => t.product_id)
  )

  const positions: Position[] = []
  for (const productId of productIds) {
    const product = CATALOG.find((p) => p.id === productId)
    if (!product) continue
    const { lots, realized } = openLotsFor(txs, productId, portfolioId)
    const quantity = lots.reduce((s, l) => s + l.qty, 0)
    if (quantity <= 0) continue

    const costBasisDollars = lots.reduce((s, l) => s + l.qty * l.price, 0)
    const unitPrice = product.current_price
    const marketValueDollars = unitPrice != null ? unitPrice * quantity : 0
    const unrealizedDollars = unitPrice != null ? marketValueDollars - costBasisDollars : -costBasisDollars

    positions.push({
      productId,
      name: product.name,
      setId: product.set_id,
      setName: product.set_name,
      tcgplayerId: product.tcgplayer_id,
      category: "ETB",
      categorySource: "inferred",
      quantity,
      currentUnitPrice: unitPrice != null ? toCents(unitPrice) : null,
      marketValue: toCents(marketValueDollars),
      costBasis: toCents(costBasisDollars),
      avgUnitCost: toCents(costBasisDollars / quantity),
      unrealizedPnl: toCents(unrealizedDollars),
      unrealizedPnlPct:
        costBasisDollars > 0 && unitPrice != null ? unrealizedDollars / costBasisDollars : null,
      realizedPnl: toCents(realized),
      valueChangePct: nullChangeMap({
        "7D": 0.012,
        "1M": 0.045,
        "3M": 0.08,
        "6M": 0.12,
        "1Y": 0.15,
        MAX: 0.18,
      }),
      signal: "Cooling",
      priceStatus: unitPrice == null ? "unknown" : "ok",
      lastPricedAt: unitPrice == null ? null : TODAY,
      portfolioShare: 0,
      holdingPeriod: {
        valueWeightedAgeDays: 120,
        oldestOpenLotDate: lots[0]?.date ?? TODAY,
        oldestOpenLotAgeDays: 120,
        lotsApproachingOneYear: 0,
      },
      trackedAth: unitPrice != null ? toCents(unitPrice * 1.15) : null,
      trackedAthDate: unitPrice != null ? "2026-06-01" : null,
      drawdownFromAthPct: unitPrice != null ? -0.13 : null,
    })
  }

  const totalValue = positions.reduce((s, p) => s + p.marketValue, 0)
  for (const p of positions) {
    p.portfolioShare = totalValue > 0 ? p.marketValue / totalValue : 0
  }
  return positions.sort((a, b) => b.marketValue - a.marketValue)
}

function buildAllocation(positions: Position[]): PortfolioAllocation {
  const bySetMap = new Map<string, { label: string; value: number; count: number }>()
  for (const p of positions) {
    const cur = bySetMap.get(p.setId) ?? { label: p.setName, value: 0, count: 0 }
    cur.value += p.marketValue
    cur.count += 1
    bySetMap.set(p.setId, cur)
  }
  const totalValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const bySet = [...bySetMap.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    value: v.value,
    share: totalValue > 0 ? v.value / totalValue : 0,
    positionCount: v.count,
  }))
  return {
    bySet,
    byCategory: [
      {
        key: "ETB",
        label: "ETB",
        value: totalValue,
        share: 1,
        positionCount: positions.length,
      },
    ],
    totalValue,
  }
}

function buildActivity(txs: DemoTransaction[], portfolioId?: string): ActivityItem[] {
  return txs
    .filter((t) => !portfolioId || t.portfolio_id === portfolioId)
    .slice()
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((t) => {
      const product = CATALOG.find((p) => p.id === t.product_id)
      const portfolio = PORTFOLIOS.find((p) => p.id === t.portfolio_id)
      const { realized } = openLotsFor(
        txs.filter(
          (x) =>
            x.product_id === t.product_id &&
            (!portfolioId || x.portfolio_id === portfolioId) &&
            (x.transaction_date < t.transaction_date ||
              (x.transaction_date === t.transaction_date && x.created_at <= t.created_at))
        ),
        t.product_id,
        portfolioId
      )
      return {
        transactionId: t.id,
        portfolioId: t.portfolio_id,
        portfolioName: portfolio?.name ?? t.portfolio_id,
        type: t.type,
        productId: t.product_id,
        productName: product?.name ?? t.product_id,
        setName: product?.set_name ?? "",
        quantity: t.quantity,
        unitPrice: toCents(t.price),
        totalAmount: toCents(t.price * t.quantity),
        date: t.transaction_date,
        realizedPnl: t.type === "sell" ? toCents(realized) : null,
        notes: t.notes,
      }
    })
}

function buildSeries(totalValue: number, timeframe: Timeframe) {
  const days = timeframe === "7D" ? 7 : timeframe === "1M" ? 30 : timeframe === "3M" ? 90 : 180
  const points = []
  for (let i = days; i >= 0; i -= Math.max(1, Math.floor(days / 24))) {
    const d = new Date(`${TODAY}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    const date = d.toISOString().slice(0, 10)
    const factor = 0.92 + (0.08 * (days - i)) / days
    points.push({
      date,
      actual: Math.round(totalValue * factor),
      projected: Math.round(totalValue * (0.95 + (0.05 * (days - i)) / days)),
      actualBasis: "market" as const,
    })
  }
  return points
}

function buildDashboard(
  txs: DemoTransaction[],
  portfolioId: string | undefined,
  timeframe: Timeframe
): ApiEnvelope<DashboardPayload> {
  const positions = buildPositions(txs, portfolioId)
  const totalValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0)
  const unrealizedPnl = totalValue - costBasis
  const realizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0)

  let totalInvested = 0
  let totalProceeds = 0
  for (const t of txs) {
    if (portfolioId && t.portfolio_id !== portfolioId) continue
    if (t.type === "buy") totalInvested += t.price * t.quantity
    else totalProceeds += t.price * t.quantity
  }

  const startValue = Math.round(totalValue * 0.92)
  const timeframes: DashboardPayload["performance"]["timeframes"] = (
    ["7D", "1M", "3M", "6M", "1Y", "MAX"] as Timeframe[]
  ).map((tf) => ({
    timeframe: tf,
    startDate: "2026-07-16",
    endDate: TODAY,
    startValue,
    endValue: totalValue,
    valueChangeAbs: totalValue - startValue,
    valueChangePct: startValue > 0 ? (totalValue - startValue) / startValue : null,
    hasFullHistory: tf !== "MAX",
  }))

  return {
    asOf: AS_OF,
    snapshotId: SNAPSHOT_ID,
    currency: "USD",
    data: {
      summary: {
        totalValue,
        costBasis,
        unrealizedPnl,
        unrealizedPnlPct: costBasis > 0 ? unrealizedPnl / costBasis : null,
        realizedPnl,
        netCashFlow: toCents(-totalInvested + totalProceeds),
        totalInvested: toCents(totalInvested),
        totalProceeds: toCents(totalProceeds),
        positionCount: positions.length,
        unitCount: positions.reduce((s, p) => s + p.quantity, 0),
        pricedPositionCount: positions.filter((p) => p.priceStatus === "ok").length,
        stalePositionCount: 0,
        unknownPositionCount: positions.filter((p) => p.priceStatus === "unknown").length,
      },
      performance: {
        timeframes,
        seriesTimeframe: timeframe,
        series: buildSeries(totalValue, timeframe),
      },
      positions: {
        positions,
        heatmapColorDomain: { min: -0.25, max: 0.25 },
      },
      allocation: buildAllocation(positions),
      activity: {
        items: buildActivity(txs, portfolioId),
        totalCount: txs.filter((t) => !portfolioId || t.portfolio_id === portfolioId).length,
      },
      insights: {
        events: [],
        activeCount: 0,
        unseenCount: 0,
        totalCount: 0,
      },
      sync: {
        // Demo never syncs — honest empty state, not a fake "fresh" pulse.
        state: "stale",
        lastAttemptedAt: null,
        lastAttemptStatus: null,
        lastSuccessfulAt: null,
        productsTotal: 0,
        productsSynced: 0,
        productsFailed: 0,
        failures: [],
        stalePositionCount: 0,
        nextScheduledDescription: null,
      },
    },
  }
}

export function createDemoStoreStub(): DemoStore {
  let transactions = SEED_TRANSACTIONS.map((t) => ({ ...t }))
  let dirty = false
  let txCounter = 0

  const store: DemoStore = {
    get today() {
      return TODAY
    },
    get state() {
      return { transactions: transactions.map((t) => ({ ...t })), dirty }
    },
    getDashboard(portfolioId, timeframe) {
      return buildDashboard(transactions, portfolioId, timeframe)
    },
    getPortfolios() {
      return PORTFOLIOS.map((p) => ({ ...p }))
    },
    getProduct(productId) {
      return CATALOG.find((p) => p.id === productId) ?? null
    },
    searchProducts(query, limit = 20) {
      const q = query.trim().toLowerCase()
      if (!q) return []
      return CATALOG.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.set_name.toLowerCase().includes(q) ||
          p.set_id.toLowerCase().includes(q)
      ).slice(0, limit)
    },
    getTransactions(portfolioId) {
      return transactions
        .filter((t) => !portfolioId || t.portfolio_id === portfolioId)
        .slice()
        .sort(
          (a, b) =>
            b.transaction_date.localeCompare(a.transaction_date) ||
            b.created_at.localeCompare(a.created_at)
        )
    },
    addTransaction(input: AddTransactionInput) {
      if (input.quantity <= 0) return { ok: false, error: "Quantity must be positive" }
      if (input.price < 0) return { ok: false, error: "Price cannot be negative" }
      if (!PORTFOLIOS.some((p) => p.id === input.portfolioId)) {
        return { ok: false, error: "Unknown portfolio" }
      }
      if (!CATALOG.some((p) => p.id === input.productId)) {
        return { ok: false, error: "Unknown product" }
      }

      if (input.type === "sell") {
        const held = heldQty(transactions, input.productId, input.portfolioId)
        if (input.quantity > held) {
          return {
            ok: false,
            error: `Cannot sell ${input.quantity}: only ${held} units held`,
          }
        }
      }

      txCounter += 1
      transactions = [
        ...transactions,
        {
          id: `tx_visitor_${txCounter}`,
          portfolio_id: input.portfolioId,
          product_id: input.productId,
          type: input.type,
          quantity: input.quantity,
          price: input.price,
          transaction_date: input.date,
          notes: input.notes ?? null,
          created_at: new Date().toISOString(),
        },
      ]
      dirty = true
      return { ok: true }
    },
    deleteTransaction(transactionId) {
      const next = transactions.filter((t) => t.id !== transactionId)
      if (next.length !== transactions.length) {
        transactions = next
        dirty = true
      }
    },
    reset() {
      transactions = SEED_TRANSACTIONS.map((t) => ({ ...t }))
      dirty = false
      txCounter = 0
    },
  }

  return store
}
