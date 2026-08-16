/**
 * Dashboard 2.0 — canonical API contract.
 *
 * THIS FILE IS THE INTERFACE BETWEEN THE BACKEND AND FRONTEND WORKSTREAMS.
 * It is owned by the integrator. Neither the backend nor the frontend branch
 * may edit it unilaterally — if a shape here is wrong or insufficient, stop and
 * raise it rather than changing it locally, because the other side is building
 * against this exact file in parallel and a silent edit desynchronises both.
 *
 * Types only. No runtime logic beyond the unit-conversion helpers at the
 * bottom, which are pure and safe to import from client or server code.
 *
 * Conventions (PRD §8), applied without exception:
 *
 *   Money        integer minor units (cents). Never a float, never a string.
 *   Percentages  decimal fraction (0.0592 === 5.92%). Formatting is the
 *                presentation layer's job.
 *   Dates        `IsoDateTime` = UTC ISO 8601 with a Z suffix.
 *                `IsoDate`     = calendar day, YYYY-MM-DD, matching how
 *                                price_snapshots / transactions store dates.
 *   Missing data `null`, never `0`. A null and a zero-percent change are
 *                different facts and must stay distinguishable (PRD §15).
 *
 * @see docs/dashboard-2.0/prd.md
 * @see docs/dashboard-2.0/decisions.md — amendments to the PRD, incl. FIFO
 */

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/** Integer minor units. 1234 === $12.34. Never fractional. */
export type Cents = number

/** Decimal fraction. 0.0592 === +5.92%. Negative for a decline. */
export type Fraction = number

/** UTC instant, ISO 8601, e.g. "2026-08-16T04:20:00Z". */
export type IsoDateTime = string

/** Calendar day, "YYYY-MM-DD". Matches the DB's `date` columns. */
export type IsoDate = string

/**
 * Per-position pricing confidence (PRD §8, §12).
 *
 * `ok`      — priced from a current, successful sync.
 * `stale`   — last sync failed to price it; showing last known-good price.
 * `unknown` — no price has ever been recorded for this product.
 *
 * A `stale` position still contributes its last known-good price to totals;
 * an `unknown` position contributes nothing and is counted separately. Neither
 * is ever silently coerced to 0.
 */
export type PriceStatus = "ok" | "stale" | "unknown"

/** PRD §11 timeframe row. All six are rendered simultaneously. */
export type Timeframe = "7D" | "1M" | "3M" | "6M" | "1Y" | "MAX"

export const TIMEFRAMES: readonly Timeframe[] = ["7D", "1M", "3M", "6M", "1Y", "MAX"] as const

/** Lookback in days per timeframe. MAX means "all recorded history". */
export const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  MAX: Infinity,
}

// ---------------------------------------------------------------------------
// Response envelope (PRD §8)
// ---------------------------------------------------------------------------

/**
 * Every dashboard endpoint returns this shape. `snapshotId` and `asOf` let any
 * consumer confirm it is reading one consistent version of "now" — the whole
 * point of the snapshot model (PRD §9).
 *
 * Acceptance criterion (PRD §23): every price-derived value in a single
 * dashboard response must reference the same `snapshotId`.
 */
export type ApiEnvelope<T> = {
  asOf: IsoDateTime
  snapshotId: string
  currency: "USD"
  data: T
}

/** Error shape. Endpoints return this with a non-2xx status. */
export type ApiError = {
  error: string
  /**
   * `schema_missing` — the analytics tables have not been migrated yet.
   * `no_snapshot`    — migrated, but nothing has published a snapshot yet.
   *
   * These are deliberately distinct: they look identical to a user staring at
   * an empty dashboard, but the fixes are completely different, and a generic
   * "unavailable" sends people debugging the wrong layer.
   */
  code?: "schema_missing" | "no_snapshot" | "not_found" | "unauthorized" | "internal"
  /** What to actually do about it, when that is knowable. */
  hint?: string
}

// ---------------------------------------------------------------------------
// /api/portfolio/summary
// ---------------------------------------------------------------------------

/**
 * Headline figures. All monetary fields are FIFO-derived — see decisions.md
 * A1: the PRD's §6 average-cost language was an error, the app is FIFO and
 * stays FIFO so the dashboard matches the existing Data page exactly (PRD §21).
 */
export type PortfolioSummary = {
  /** Sum of (current unit price × qty held) across all priced positions. */
  totalValue: Cents
  /** FIFO cost basis of open lots only: Σ(remaining_qty × lot_buy_price). */
  costBasis: Cents
  /** totalValue − costBasis. */
  unrealizedPnl: Cents
  /** unrealizedPnl / costBasis. null when costBasis is 0. */
  unrealizedPnlPct: Fraction | null
  /** FIFO realized P/L across all closed quantity. */
  realizedPnl: Cents
  /** −totalInvested + totalProceeds (PRD §6). Negative = net money in. */
  netCashFlow: Cents
  /** Cumulative cash spent on buys, all time. */
  totalInvested: Cents
  /** Cumulative cash received from sells, all time. */
  totalProceeds: Cents

  /** Distinct products with qty > 0. */
  positionCount: number
  /** Total units held across all positions. */
  unitCount: number
  /** Positions by pricing confidence — drives the partial-data indicator. */
  pricedPositionCount: number
  stalePositionCount: number
  unknownPositionCount: number
}

// ---------------------------------------------------------------------------
// /api/portfolio/performance
// ---------------------------------------------------------------------------

/**
 * Value Change over one window — NOT investment return (PRD §6).
 *
 * Naming is load-bearing and enforced by acceptance criteria: this is
 * `valueChangePct`, never `returnPct`. It includes the effect of buys and
 * sells inside the window, which is exactly why it must not be called a
 * return.
 */
export type ValueChange = {
  timeframe: Timeframe
  /** First date in the window with data. null when no history covers it. */
  startDate: IsoDate | null
  endDate: IsoDate
  startValue: Cents | null
  endValue: Cents
  /** endValue − startValue. null when startValue is null. */
  valueChangeAbs: Cents | null
  /** (endValue − startValue) / startValue. null when unknown — never 0. */
  valueChangePct: Fraction | null
  /**
   * False when history begins after the window would have started, i.e. the
   * figure covers a shorter span than its label implies. The UI must mark
   * these rather than presenting them as a full-window figure.
   */
  hasFullHistory: boolean
}

/**
 * One point on the value chart (PRD §16).
 *
 * `actual`    — the portfolio's real historical value on that date.
 * `projected` — what today's holdings would have been worth on that date.
 *
 * Both are full alternate series over the same window; they overlap and cross,
 * which is meaningful rather than a rendering bug. Either may be null on dates
 * where that series has no data — render a gap, do not interpolate to 0.
 */
/**
 * How `actual` was valued on this date.
 *
 * Pokéfolio only knows prices from the day it started tracking a product, but
 * holdings predate that. Valuing those days at 0 would corrupt the chart (PRD
 * §12 forbids treating a missing price as zero), and valuing them at cost
 * without saying so is the silent substitution PRD §8 forbids. So the value
 * falls back to cost basis — matching what `/dashboard` and `/data` already do
 * — and the basis is reported alongside it so the UI can mark the span.
 *
 * "market"  — every held position had a real recorded price.
 * "partial" — some positions priced, the rest valued at cost basis.
 * "cost"    — nothing held that day had a price yet; entirely cost basis.
 */
export type ValuationBasis = "market" | "partial" | "cost"

export type PerformancePoint = {
  date: IsoDate
  actual: Cents | null
  projected: Cents | null
  /** Basis for `actual`. null when `actual` is null (nothing held). */
  actualBasis: ValuationBasis | null
}

export type PortfolioPerformance = {
  /** All six windows, always returned together — the PRD §11 timeframe row. */
  timeframes: ValueChange[]
  /** Which window `series` covers. Echoes the `timeframe` query param. */
  seriesTimeframe: Timeframe
  /** Chart data for `seriesTimeframe`, ascending by date. */
  series: PerformancePoint[]
}

// ---------------------------------------------------------------------------
// Product categorization (PRD §13)
// ---------------------------------------------------------------------------

export type ProductCategory =
  | "Booster Box"
  /** Deliberately distinct from Booster Box — different products (PRD §13). */
  | "Booster Bundle"
  | "ETB"
  | "Tin"
  | "Collection Box"
  | "Blister"
  | "Specialty"
  /** Explicit fallback. Never silently misclassify into a real bucket. */
  | "Uncategorized"

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  "Booster Box",
  "Booster Bundle",
  "ETB",
  "Tin",
  "Collection Box",
  "Blister",
  "Specialty",
  "Uncategorized",
] as const

// ---------------------------------------------------------------------------
// /api/portfolio/positions
// ---------------------------------------------------------------------------

/**
 * Exit-review signal. Reuses the existing implementation in
 * `@/lib/compare-series` (`classifyExitReviewSignal`) rather than
 * reimplementing it — PRD §21 forbids a silent recalculation.
 */
export type PositionSignal =
  | "Accelerating"
  | "Cooling"
  | "Recovering"
  | "Declining"
  | "Insufficient data"

/** Lot-level holding-period metrics (PRD §14), rolled up for display. */
export type HoldingPeriod = {
  /** Each open lot's age weighted by its current value. null if unpriced. */
  valueWeightedAgeDays: number | null
  /** Buy date of the oldest lot still open. */
  oldestOpenLotDate: IsoDate | null
  oldestOpenLotAgeDays: number | null
  /** Open lots aged 335–364 days inclusive — the long-term-gains window. */
  lotsApproachingOneYear: number
}

/**
 * One aggregated position: a product summed across every lot within scope.
 * The web client renders these as a heatmap, a future mobile client as cards —
 * which is why there is no /api/heatmap endpoint (PRD §8).
 */
export type Position = {
  productId: string
  name: string
  setId: string
  setName: string
  tcgplayerId: string | null

  /** effective_category = category_override ?? inferred_category (PRD §13). */
  category: ProductCategory
  categorySource: "override" | "inferred"

  /** Net units held (buys − sells). Always > 0; closed positions are omitted. */
  quantity: number
  currentUnitPrice: Cents | null
  /** currentUnitPrice × quantity. 0 only when the price is genuinely unknown. */
  marketValue: Cents
  /** FIFO cost basis of this position's open lots. */
  costBasis: Cents
  avgUnitCost: Cents
  unrealizedPnl: Cents
  unrealizedPnlPct: Fraction | null
  realizedPnl: Cents

  /**
   * Per-unit price change per window. A window with no usable history maps to
   * null — the heatmap renders that as its distinct Unknown state (PRD §15),
   * never as 0%.
   */
  valueChangePct: Record<Timeframe, Fraction | null>

  signal: PositionSignal
  priceStatus: PriceStatus
  /** Date of the price actually used. Older than asOf ⇒ stale. */
  lastPricedAt: IsoDate | null

  /** This position's share of total portfolio value. Feeds concentration. */
  portfolioShare: Fraction

  holdingPeriod: HoldingPeriod

  /**
   * Highest price Pokéfolio has ever recorded — deliberately "Tracked ATH",
   * not "all-time high" (PRD §18). The app has no market data predating its
   * own tracking, and the label must not imply a stronger claim.
   */
  trackedAth: Cents | null
  trackedAthDate: IsoDate | null
  /** (current − trackedAth) / trackedAth. Negative or 0. null if no ATH. */
  drawdownFromAthPct: Fraction | null
}

export type PositionsPayload = {
  positions: Position[]
  /** Echoed so the client can colour-clamp consistently (PRD §15: ±25%). */
  heatmapColorDomain: { min: Fraction; max: Fraction }
}

// ---------------------------------------------------------------------------
// /api/portfolio/allocation
// ---------------------------------------------------------------------------

export type AllocationBucket = {
  /** Stable identifier — set_id, or the category name. */
  key: string
  /** Human label — set_name, or the category name. */
  label: string
  value: Cents
  /** value / totalValue. */
  share: Fraction
  positionCount: number
}

export type PortfolioAllocation = {
  bySet: AllocationBucket[]
  byCategory: AllocationBucket[]
  /** Denominator used for every `share`, so the client never re-derives it. */
  totalValue: Cents
}

// ---------------------------------------------------------------------------
// /api/activity
// ---------------------------------------------------------------------------

export type ActivityItem = {
  transactionId: string
  portfolioId: string
  portfolioName: string
  productId: string
  productName: string
  setName: string
  type: "buy" | "sell"
  quantity: number
  unitPrice: Cents
  /** unitPrice × quantity. */
  totalAmount: Cents
  date: IsoDate
  /** FIFO realized P/L for this sell. null on buys. */
  realizedPnl: Cents | null
  notes: string | null
}

export type ActivityPayload = {
  items: ActivityItem[]
  /** Total matching transactions, so the client can offer "view all". */
  totalCount: number
}

// ---------------------------------------------------------------------------
// /api/insights  (PRD §17–19)
// ---------------------------------------------------------------------------

export type InsightType = "signal_transition" | "outsized_move" | "concentration" | "drawdown"

/**
 * Whether the underlying *condition* still holds. Deliberately independent of
 * `seenAt`: seen is not resolved (PRD §17). Marking an event seen must never
 * stop the panel reporting a risk that is still true.
 */
export type InsightState = "active" | "resolved"

/** Row grouping in the What Changed panel (PRD §19). */
export type InsightCategory =
  /** ⚠ negative transitions, outsized down moves, concentration, drawdown */
  | "needs_attention"
  /** ↗ outsized up moves, positive resolutions */
  | "positive"
  /** ↻ neutral transitions */
  | "signal_change"

export type SignalTransitionPayload = {
  kind: "signal_transition"
  fromSignal: PositionSignal
  toSignal: PositionSignal
}

export type OutsizedMovePayload = {
  kind: "outsized_move"
  direction: "up" | "down"
  /** The move that triggered it, as a fraction. */
  movePct: Fraction
  timeframe: Timeframe
  /** State-machine transition that produced this event (PRD §18). */
  fromState: "NORMAL" | "OUTSIZED_UP" | "OUTSIZED_DOWN"
  toState: "NORMAL" | "OUTSIZED_UP" | "OUTSIZED_DOWN"
}

export type ConcentrationPayload = {
  kind: "concentration"
  /** Position's share of the portfolio at trigger time. */
  sharePct: Fraction
  thresholdPct: Fraction
}

export type DrawdownPayload = {
  kind: "drawdown"
  /** Negative fraction: how far below Tracked ATH. */
  drawdownPct: Fraction
  thresholdPct: Fraction
  trackedAth: Cents
  trackedAthDate: IsoDate
}

export type InsightPayload =
  | SignalTransitionPayload
  | OutsizedMovePayload
  | ConcentrationPayload
  | DrawdownPayload

export type InsightEvent = {
  id: string
  type: InsightType
  category: InsightCategory
  state: InsightState
  /**
   * Deterministic function of the event (PRD §19). The panel sorts by this
   * descending. Never a fixed per-type priority — that misorders a minor
   * signal flip above a −42% move.
   */
  severity: number

  /** Product this concerns. */
  entityId: string
  entityName: string
  setName: string

  /** Pre-rendered one-liner, e.g. "Declining: Blooming Waters — −14.65% (1M)". */
  headline: string
  /** Optional supporting sentence. */
  detail: string | null

  triggeredAt: IsoDateTime
  resolvedAt: IsoDateTime | null
  seenAt: IsoDateTime | null
  /** Which published snapshot this was computed from (PRD §17). */
  snapshotId: string
  dedupeKey: string
  payload: InsightPayload
}

export type InsightsPayload = {
  /**
   * Severity-descending. The server returns everything matching the query —
   * the cap of 5 is a *display* concern only and must never be applied at the
   * storage or API layer (PRD §19).
   */
  events: InsightEvent[]
  /** Active events, ignoring any display cap. */
  activeCount: number
  /** Active events not yet seen. */
  unseenCount: number
  totalCount: number
}

/** POST /api/insights/seen — body. Marks events seen; does NOT resolve them. */
export type MarkSeenRequest = {
  /** Event ids to stamp with seenAt. Empty array is a no-op, not an error. */
  eventIds: string[]
}

// ---------------------------------------------------------------------------
// /api/sync/status  (PRD §12)
// ---------------------------------------------------------------------------

/**
 * Explicit freshness states, so the dashboard cannot misrepresent data health.
 * A failed sync must never imply data was just refreshed — which is why
 * lastAttemptedAt and lastSuccessfulAt are separate fields.
 */
export type SyncState =
  | "fresh"
  | "partially_priced"
  | "stale"
  | "in_progress"
  | "failed"

export type SyncStatusPayload = {
  state: SyncState
  lastAttemptedAt: IsoDateTime | null
  lastAttemptStatus: "success" | "partial" | "failed" | "skipped" | null
  /** Distinct from the above on purpose. Drives the "Synced 8m ago" label. */
  lastSuccessfulAt: IsoDateTime | null

  productsTotal: number
  productsSynced: number
  productsFailed: number
  failures: Array<{ productId: string; name: string | null; reason: string }>

  /** Positions currently carrying a stale price. */
  stalePositionCount: number
  /** Human sentence for the next scheduled run, or null if unscheduled. */
  nextScheduledDescription: string | null
}

// ---------------------------------------------------------------------------
// /api/dashboard  — BFF fan-out (PRD §8)
// ---------------------------------------------------------------------------

/**
 * Consumer-specific convenience so the web dashboard doesn't fire seven
 * requests on load. Explicitly NOT the canonical domain model — it is a
 * server-side fan-out over the endpoints above and must add no logic of its
 * own. Mobile is expected to call the domain endpoints directly.
 */
export type DashboardPayload = {
  summary: PortfolioSummary
  performance: PortfolioPerformance
  positions: PositionsPayload
  allocation: PortfolioAllocation
  activity: ActivityPayload
  insights: InsightsPayload
  sync: SyncStatusPayload
}

// ---------------------------------------------------------------------------
// Query parameters, shared by every endpoint above
// ---------------------------------------------------------------------------

/**
 * `portfolioId` omitted ⇒ all portfolios combined, which is the dashboard's
 * default scope (PRD §6). The switcher passes a specific id.
 */
export type DashboardQuery = {
  portfolioId?: string
  /** Only meaningful for /performance and /dashboard. Defaults to "1M". */
  timeframe?: Timeframe
  /** Only meaningful for /activity. Defaults to 10. */
  limit?: number
}

// ---------------------------------------------------------------------------
// Unit conversion — the only runtime code in this module
// ---------------------------------------------------------------------------

/**
 * Dollars (as stored in Postgres `decimal(10,2)`, which supabase-js hands back
 * as a number or a string) to integer cents.
 *
 * Rounds rather than truncates: 12.345 → 1235 (well, 1234 or 1235 depending on
 * float representation) is acceptable, silently dropping a cent is not.
 */
export function toCents(dollars: number | string | null | undefined): Cents {
  if (dollars == null) return 0
  const n = typeof dollars === "string" ? Number(dollars) : dollars
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Nullable variant — preserves "no value" instead of collapsing it to 0. */
export function toCentsOrNull(dollars: number | string | null | undefined): Cents | null {
  if (dollars == null) return null
  const n = typeof dollars === "string" ? Number(dollars) : dollars
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** Cents back to a dollar float. For display only — never for further math. */
export function centsToDollars(cents: Cents): number {
  return cents / 100
}

/**
 * Percent-as-fraction from two cent values. Returns null when `from` is 0 or
 * either side is null, because an undefined change is not a 0% change.
 */
export function fractionChange(from: Cents | null, to: Cents | null): Fraction | null {
  if (from == null || to == null || from === 0) return null
  return (to - from) / from
}
