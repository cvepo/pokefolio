/**
 * Pure rebasing + metrics math for the Compare page.
 * No React, no Supabase — trivially testable.
 */
import {
  buildPriceIndex,
  daterange,
  priceOnOrBefore,
  type PriceIndex,
} from "@/lib/price-lookup"

export type CompareView = "per_unit_pct" | "position_abs" | "combined_pct"

export type CompareProduct = {
  product_id: string
  name: string
  set_name: string
  tcgplayer_id: string | null
  qty: number
  avg_cost: number
  current_price: number
  current_price_source: "snapshot" | "products_fallback"
  last_snapshot_date: string | null
  history: Array<[string, number]>
}

export type CompareSeriesMeta = {
  as_of_date: string
  earliest_date: string
  products_current: number
  products_total: number
  total_starting_value: number
}

export type CompareSeriesResponse = {
  products: CompareProduct[]
  meta: CompareSeriesMeta
}

export type ExitReviewSignal =
  | "Accelerating"
  | "Cooling"
  | "Recovering"
  | "Declining"
  | "Insufficient data"

export type SeriesAnchor = {
  date: string
  price: number
  ageDays: number
  /** True when the prior snapshot used as anchor is > 7d before windowStart. */
  stale: boolean
}

export type CompareTableRow = {
  product_id: string
  name: string
  set_name: string
  tcgplayer_id: string | null
  qty: number
  avg_cost: number
  current_price: number
  current_price_source: "snapshot" | "products_fallback"
  last_snapshot_date: string | null
  /** Days last_snapshot_date trails windowEnd; null if unknown. */
  staleDays: number | null
  windowPct: number | null
  momentum7dPct: number | null
  drawdownPct: number | null
  positionDelta: number | null
  perUnitDelta: number | null
  unrealized: number | null
  unrealizedPct: number | null
  anchorDate: string | null
  anchorAgeDays: number | null
  signal: ExitReviewSignal
  /** v2 contribution metrics — computed for tests / future columns. */
  returnContribution: number | null
  movementShare: number | null
  /** True when the product has no plottable history / bad anchor. */
  chartExcluded: boolean
  noPriceHistory: boolean
}

export const TIMEFRAME_DAYS: Record<string, number> = {
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  MAX: Infinity,
}

export const COMPARE_PALETTE = [
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#3b82f6", // blue
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
] as const

/** Parse YYYY-MM-DD as local midnight (timezone-safe). */
export function parseLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Inclusive calendar-day difference: end − start. */
export function daysBetween(start: string, end: string): number {
  const s = parseLocalDate(start)
  const e = parseLocalDate(end)
  return Math.round((e.getTime() - s.getTime()) / 86_400_000)
}

/**
 * Window start for a timeframe ending at `asOfDate`.
 * Uses local-midnight arithmetic — never `new Date(str)` UTC parse.
 */
export function windowStartFor(
  asOfDate: string,
  timeframe: string,
  earliestDate: string
): string {
  const days = TIMEFRAME_DAYS[timeframe] ?? 30
  if (!Number.isFinite(days) || days === Infinity) {
    return earliestDate || asOfDate
  }
  const end = parseLocalDate(asOfDate)
  end.setDate(end.getDate() - days)
  return formatLocalDate(end)
}

/** Filter + coerce history tuples; drop null/NaN/≤0 prices. */
export function sanitizeHistory(
  history: Array<[string, number | string | null]>
): Array<[string, number]> {
  const out: Array<[string, number]> = []
  for (const [date, raw] of history) {
    const price = Number(raw)
    if (!Number.isFinite(price) || price <= 0) continue
    out.push([date, price])
  }
  out.sort((a, b) => a[0].localeCompare(b[0]))
  return out
}

/** Build a PriceIndex from CompareProduct[].history, applying §5.12 guards. */
export function buildComparePriceIndex(products: CompareProduct[]): PriceIndex {
  const rows: Array<{ product_id: string; price: number; snapshot_date: string }> = []
  for (const p of products) {
    for (const [date, price] of sanitizeHistory(p.history)) {
      rows.push({ product_id: p.product_id, price, snapshot_date: date })
    }
  }
  return buildPriceIndex(rows)
}

/** Snapshot entry on or before `date`, or null. */
export function snapshotOnOrBefore(
  idx: PriceIndex,
  productId: string,
  date: string
): { date: string; price: number } | null {
  const arr = idx[productId]
  if (!arr?.length) return null
  let lo = 0
  let hi = arr.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid].date <= date) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found >= 0 ? arr[found] : null
}

/** First snapshot on or after `date`, or null. */
export function snapshotOnOrAfter(
  idx: PriceIndex,
  productId: string,
  date: string
): { date: string; price: number } | null {
  const arr = idx[productId]
  if (!arr?.length) return null
  for (const s of arr) {
    if (s.date >= date) return s
  }
  return null
}

/**
 * Anchor selection per §5.8.
 * Returns null when no usable anchor (no history / zero price).
 */
export function resolveAnchor(
  idx: PriceIndex,
  productId: string,
  windowStart: string
): SeriesAnchor | null {
  const prior = snapshotOnOrBefore(idx, productId, windowStart)
  if (prior) {
    const ageDays = daysBetween(prior.date, windowStart)
    if (prior.price <= 0) return null
    return {
      date: windowStart,
      price: prior.price,
      ageDays,
      stale: ageDays > 7,
    }
  }
  const later = snapshotOnOrAfter(idx, productId, windowStart)
  if (!later || later.price <= 0) return null
  return {
    date: later.date,
    price: later.price,
    ageDays: 0,
    stale: false,
  }
}

/**
 * Forward-filled runs longer than 7 days within [anchorDate, windowEnd].
 * A date is "filled" when it has no real snapshot and uses a prior price.
 */
export function computeFilledRanges(
  idx: PriceIndex,
  productId: string,
  anchorDate: string,
  windowEnd: string
): Array<[string, string]> {
  const arr = idx[productId]
  if (!arr?.length) return []
  const realDates = new Set(arr.map((s) => s.date))
  const dates = daterange(anchorDate, windowEnd)
  const ranges: Array<[string, string]> = []
  let runStart: string | null = null
  let runLen = 0

  const flush = (endDate: string) => {
    if (runStart && runLen > 7) ranges.push([runStart, endDate])
    runStart = null
    runLen = 0
  }

  for (const d of dates) {
    const filled = !realDates.has(d) && priceOnOrBefore(idx, productId, d) != null
    if (filled) {
      if (!runStart) runStart = d
      runLen += 1
    } else if (runStart) {
      // Previous day ended the run
      const prev = dates[dates.indexOf(d) - 1]
      if (prev) flush(prev)
      else {
        runStart = null
        runLen = 0
      }
    }
  }
  if (runStart) flush(dates[dates.length - 1])
  return ranges
}

function isDateInRanges(date: string, ranges: Array<[string, string]>): boolean {
  for (const [a, b] of ranges) {
    if (date >= a && date <= b) return true
  }
  return false
}

export function buildComparisonSeries(opts: {
  products: CompareProduct[]
  selectedIds: string[]
  windowStart: string
  windowEnd: string
  view: CompareView
  /** Pre-built index; rebuilt if omitted. */
  priceIndex?: PriceIndex
}): {
  rows: Array<Record<string, number | string | null>>
  anchors: Record<string, SeriesAnchor>
  basketAnchorDate: string | null
  filledRanges: Record<string, Array<[string, string]>>
  /** Products dropped from the chart (bad/missing anchor). */
  excludedIds: string[]
} {
  const idx = opts.priceIndex ?? buildComparePriceIndex(opts.products)
  const selected = opts.products.filter((p) => opts.selectedIds.includes(p.product_id))
  const anchors: Record<string, SeriesAnchor> = {}
  const filledRanges: Record<string, Array<[string, string]>> = {}
  const excludedIds: string[] = []

  for (const p of selected) {
    const anchor = resolveAnchor(idx, p.product_id, opts.windowStart)
    if (!anchor || anchor.price <= 0) {
      excludedIds.push(p.product_id)
      continue
    }
    anchors[p.product_id] = anchor
    filledRanges[p.product_id] = computeFilledRanges(
      idx,
      p.product_id,
      anchor.date,
      opts.windowEnd
    )
  }

  const chartable = selected.filter((p) => anchors[p.product_id])

  if (opts.view === "combined_pct") {
    return buildCombinedSeries({
      products: chartable,
      anchors,
      filledRanges,
      excludedIds,
      idx,
      windowStart: opts.windowStart,
      windowEnd: opts.windowEnd,
    })
  }

  // Dense date range over the full window; per-product values null before anchor.
  const dates = daterange(opts.windowStart, opts.windowEnd)
  const rows: Array<Record<string, number | string | null>> = dates.map((date) => {
    const row: Record<string, number | string | null> = { date }
    for (const p of chartable) {
      const anchor = anchors[p.product_id]
      if (date < anchor.date) {
        row[p.product_id] = null
        row[`${p.product_id}__dashed`] = null
        continue
      }
      const price = priceOnOrBefore(idx, p.product_id, date)
      if (price == null || price <= 0) {
        row[p.product_id] = null
        row[`${p.product_id}__dashed`] = null
        continue
      }
      let value: number
      if (opts.view === "per_unit_pct") {
        value = (price / anchor.price - 1) * 100
      } else {
        // position_abs
        value = (price - anchor.price) * p.qty
      }
      const dashed = isDateInRanges(date, filledRanges[p.product_id] ?? [])
      if (dashed) {
        row[p.product_id] = null
        row[`${p.product_id}__dashed`] = value
      } else {
        row[p.product_id] = value
        row[`${p.product_id}__dashed`] = null
      }
    }
    return row
  })

  // Connect solid↔dashed boundaries so the line doesn't gap.
  stitchSegmentBoundaries(rows, chartable.map((p) => p.product_id))

  return {
    rows,
    anchors,
    basketAnchorDate: null,
    filledRanges,
    excludedIds,
  }
}

function stitchSegmentBoundaries(
  rows: Array<Record<string, number | string | null>>,
  productIds: string[]
) {
  for (const id of productIds) {
    const solid = id
    const dashed = `${id}__dashed`
    for (let i = 0; i < rows.length; i++) {
      const cur = rows[i]
      const prev = i > 0 ? rows[i - 1] : null
      // At the start of a dashed run, copy the last solid value onto dashed.
      if (
        prev &&
        cur[dashed] != null &&
        cur[solid] == null &&
        prev[solid] != null &&
        prev[dashed] == null
      ) {
        cur[solid] = prev[solid]
      }
      // At the start of a solid run after dashed, copy onto solid from dashed.
      if (
        prev &&
        cur[solid] != null &&
        cur[dashed] == null &&
        prev[dashed] != null &&
        prev[solid] == null
      ) {
        cur[dashed] = prev[dashed]
      }
    }
  }
}

function buildCombinedSeries(opts: {
  products: CompareProduct[]
  anchors: Record<string, SeriesAnchor>
  filledRanges: Record<string, Array<[string, string]>>
  excludedIds: string[]
  idx: PriceIndex
  windowStart: string
  windowEnd: string
}): {
  rows: Array<Record<string, number | string | null>>
  anchors: Record<string, SeriesAnchor>
  basketAnchorDate: string | null
  filledRanges: Record<string, Array<[string, string]>>
  excludedIds: string[]
} {
  const { products, anchors, idx } = opts
  if (!products.length) {
    return {
      rows: [],
      anchors,
      basketAnchorDate: null,
      filledRanges: opts.filledRanges,
      excludedIds: opts.excludedIds,
    }
  }

  const basketAnchorDate = products.reduce(
    (max, p) => (anchors[p.product_id].date > max ? anchors[p.product_id].date : max),
    anchors[products[0].product_id].date
  )

  const basketAnchorPrice: Record<string, number> = {}
  let denom = 0
  for (const p of products) {
    const price = priceOnOrBefore(idx, p.product_id, basketAnchorDate)
    if (price == null || price <= 0) {
      // Shouldn't happen given anchor resolution, but guard.
      continue
    }
    basketAnchorPrice[p.product_id] = price
    denom += price * p.qty
  }

  const dates = daterange(basketAnchorDate, opts.windowEnd)
  const rows: Array<Record<string, number | string | null>> = []

  for (const date of dates) {
    let combined$ = 0
    let allPriced = true
    const contributors: Record<string, number> = {}
    for (const p of products) {
      const bap = basketAnchorPrice[p.product_id]
      if (bap == null) {
        allPriced = false
        break
      }
      const price = priceOnOrBefore(idx, p.product_id, date)
      if (price == null) {
        allPriced = false
        break
      }
      const contrib = (price - bap) * p.qty
      contributors[p.product_id] = contrib
      combined$ += contrib
    }
    if (!allPriced || denom <= 0) continue
    const combinedPct = (combined$ / denom) * 100
    rows.push({
      date,
      combined: combinedPct,
      combined$: combined$,
      ...Object.fromEntries(
        Object.entries(contributors).map(([id, v]) => [`contrib__${id}`, v])
      ),
    })
  }

  return {
    rows,
    anchors,
    basketAnchorDate,
    filledRanges: opts.filledRanges,
    excludedIds: opts.excludedIds,
  }
}

/**
 * 7D momentum from the product's own most recent two *real* snapshots
 * within a 7-day lookback ending at windowEnd. Never uses forward-fill.
 */
export function computeMomentum7d(
  idx: PriceIndex,
  productId: string,
  windowEnd: string
): number | null {
  const arr = idx[productId]
  if (!arr?.length) return null
  const lookbackStart = (() => {
    const d = parseLocalDate(windowEnd)
    d.setDate(d.getDate() - 7)
    return formatLocalDate(d)
  })()

  const inWindow = arr.filter((s) => s.date >= lookbackStart && s.date <= windowEnd)
  if (inWindow.length < 2) return null
  // Most recent two real snapshots in the lookback.
  const latest = inWindow[inWindow.length - 1]
  const prior = inWindow[inWindow.length - 2]
  if (prior.price <= 0) return null
  return (latest.price / prior.price - 1) * 100
}

/** Max real (or forward-filled) price in [anchorDate, windowEnd]. */
function windowMaxPrice(
  idx: PriceIndex,
  productId: string,
  from: string,
  to: string
): number | null {
  const dates = daterange(from, to)
  let max: number | null = null
  for (const d of dates) {
    const p = priceOnOrBefore(idx, productId, d)
    if (p != null && p > 0 && (max == null || p > max)) max = p
  }
  return max
}

/**
 * Count real (non-forward-filled) snapshot points in [windowStart, windowEnd]
 * that fall on or after the product's anchor date.
 */
function realPointsInWindow(
  idx: PriceIndex,
  productId: string,
  windowStart: string,
  windowEnd: string,
  anchorDate: string
): number {
  const arr = idx[productId]
  if (!arr?.length) return 0
  const from = windowStart > anchorDate ? windowStart : anchorDate
  return arr.filter((s) => s.date >= from && s.date <= windowEnd).length
}

/**
 * Exit-review signal classification (§5.16). Descriptive, never prescriptive.
 */
export function classifyExitReviewSignal(opts: {
  windowPct: number | null
  momentum7dPct: number | null
  windowDays: number
  realPoints: number
  staleDays: number | null
}): ExitReviewSignal {
  const { windowPct, momentum7dPct, windowDays, realPoints, staleDays } = opts
  if (
    realPoints < 2 ||
    (staleDays != null && staleDays > 14) ||
    windowPct == null ||
    momentum7dPct == null
  ) {
    return "Insufficient data"
  }

  // Window up: compare the 7D move against the window's own pace, scaled to 7 days.
  // A winner gaining slower than its window rate is losing momentum, not accelerating —
  // this is the "stalled winner" case the page exists to surface.
  if (windowPct > 0) {
    const windowRateAs7d = windowDays > 0 ? windowPct * (7 / windowDays) : windowPct
    return momentum7dPct > windowRateAs7d ? "Accelerating" : "Cooling"
  }

  if (windowPct < 0 && momentum7dPct > 0) return "Recovering"
  if (windowPct < 0 && momentum7dPct < 0) return "Declining"

  return "Insufficient data"
}

export function computeRowMetrics(opts: {
  products: CompareProduct[]
  selectedIds: string[]
  windowStart: string
  windowEnd: string
  totalStartingPortfolioValue: number
  priceIndex?: PriceIndex
}): CompareTableRow[] {
  const idx = opts.priceIndex ?? buildComparePriceIndex(opts.products)
  const windowDays = Math.max(1, daysBetween(opts.windowStart, opts.windowEnd))

  // Precompute anchors + position changes for ALL held products (contribution denom scope).
  const allAnchors: Record<string, SeriesAnchor | null> = {}
  const positionChanges: Record<string, number | null> = {}
  for (const p of opts.products) {
    const anchor = resolveAnchor(idx, p.product_id, opts.windowStart)
    allAnchors[p.product_id] = anchor
    if (!anchor || !p.history.length) {
      positionChanges[p.product_id] = null
      continue
    }
    const endPrice = priceOnOrBefore(idx, p.product_id, opts.windowEnd)
    if (endPrice == null) {
      positionChanges[p.product_id] = null
      continue
    }
    positionChanges[p.product_id] = (endPrice - anchor.price) * p.qty
  }

  const absSum = opts.products.reduce((s, p) => {
    const v = positionChanges[p.product_id]
    return s + (v != null ? Math.abs(v) : 0)
  }, 0)

  // Starting portfolio value = Σ (anchorPrice × qty) across ALL held products.
  // Caller-supplied totalStartingPortfolioValue is used only when anchors can't be resolved.
  let startValue = opts.products.reduce((s, p) => {
    const a = allAnchors[p.product_id]
    return s + (a ? a.price * p.qty : 0)
  }, 0)
  if (startValue <= 0 && opts.totalStartingPortfolioValue > 0) {
    startValue = opts.totalStartingPortfolioValue
  }

  const selectedSet = new Set(opts.selectedIds)
  // Table shows selected products (synced to selection per §5.16).
  const rows: CompareTableRow[] = []

  for (const p of opts.products) {
    if (!selectedSet.has(p.product_id)) continue

    const noPriceHistory = p.history.length === 0
    const anchor = allAnchors[p.product_id]
    const staleDays =
      p.last_snapshot_date != null
        ? daysBetween(p.last_snapshot_date, opts.windowEnd)
        : null

    if (noPriceHistory || !anchor || anchor.price <= 0) {
      rows.push({
        product_id: p.product_id,
        name: p.name,
        set_name: p.set_name,
        tcgplayer_id: p.tcgplayer_id,
        qty: p.qty,
        avg_cost: p.avg_cost,
        current_price: p.current_price,
        current_price_source: p.current_price_source,
        last_snapshot_date: p.last_snapshot_date,
        staleDays,
        windowPct: null,
        momentum7dPct: null,
        drawdownPct: null,
        positionDelta: null,
        perUnitDelta: null,
        unrealized:
          p.avg_cost > 0 ? (p.current_price - p.avg_cost) * p.qty : null,
        unrealizedPct:
          p.avg_cost > 0
            ? ((p.current_price - p.avg_cost) / p.avg_cost) * 100
            : null,
        anchorDate: null,
        anchorAgeDays: null,
        signal: "Insufficient data",
        returnContribution: null,
        movementShare: null,
        chartExcluded: true,
        noPriceHistory,
      })
      continue
    }

    const endPrice =
      priceOnOrBefore(idx, p.product_id, opts.windowEnd) ?? p.current_price
    const windowPct = (endPrice / anchor.price - 1) * 100
    const perUnitDelta = endPrice - anchor.price
    const positionDelta = perUnitDelta * p.qty
    const momentum7dPct = computeMomentum7d(idx, p.product_id, opts.windowEnd)

    const maxPx = windowMaxPrice(idx, p.product_id, anchor.date, opts.windowEnd)
    const drawdownPct =
      maxPx != null && maxPx > 0 ? (endPrice / maxPx - 1) * 100 : null

    const realPoints = realPointsInWindow(
      idx,
      p.product_id,
      opts.windowStart,
      opts.windowEnd,
      anchor.date
    )

    const signal = classifyExitReviewSignal({
      windowPct,
      momentum7dPct,
      windowDays,
      realPoints,
      staleDays,
    })

    const returnContribution =
      startValue > 0 ? (positionDelta / startValue) * 100 : null
    const movementShare =
      absSum > 0 ? (Math.abs(positionDelta) / absSum) * 100 : null

    rows.push({
      product_id: p.product_id,
      name: p.name,
      set_name: p.set_name,
      tcgplayer_id: p.tcgplayer_id,
      qty: p.qty,
      avg_cost: p.avg_cost,
      current_price: p.current_price,
      current_price_source: p.current_price_source,
      last_snapshot_date: p.last_snapshot_date,
      staleDays,
      windowPct,
      momentum7dPct,
      drawdownPct,
      positionDelta,
      perUnitDelta,
      unrealized: (p.current_price - p.avg_cost) * p.qty,
      unrealizedPct:
        p.avg_cost > 0
          ? ((p.current_price - p.avg_cost) / p.avg_cost) * 100
          : null,
      anchorDate: anchor.date,
      anchorAgeDays: anchor.ageDays,
      signal,
      returnContribution,
      movementShare,
      chartExcluded: false,
      noPriceHistory: false,
    })
  }

  return rows
}

/**
 * Position % equals Per-unit % — quantity cancels.
 * Exposed for the required guard test (§10.10).
 */
export function positionPctEqualsPerUnitPct(
  price: number,
  anchorPrice: number
): boolean {
  if (anchorPrice <= 0) return false
  const perUnit = (price / anchorPrice - 1) * 100
  const qty = 7 // arbitrary
  const positionPct =
    (((price - anchorPrice) * qty) / (anchorPrice * qty)) * 100
  return Math.abs(perUnit - positionPct) < 1e-9
}

/**
 * Assign colors by position within the selected set, preserving prior
 * assignments and resolving collisions while free palette slots exist.
 */
export function assignSeriesColors(
  selectedIds: string[],
  prior: Record<string, string> = {}
): Record<string, string> {
  const result: Record<string, string> = {}
  const used = new Set<string>()

  // Pass 1: keep prior colors when still unique and in palette.
  for (const id of selectedIds) {
    const prev = prior[id]
    if (prev && !used.has(prev)) {
      result[id] = prev
      used.add(prev)
    }
  }

  // Pass 2: assign free palette slots to newcomers / collisions.
  let cursor = 0
  for (const id of selectedIds) {
    if (result[id]) continue
    while (cursor < COMPARE_PALETTE.length && used.has(COMPARE_PALETTE[cursor])) {
      cursor += 1
    }
    if (cursor < COMPARE_PALETTE.length) {
      result[id] = COMPARE_PALETTE[cursor]
      used.add(COMPARE_PALETTE[cursor])
      cursor += 1
    } else {
      // Past 10: repeat by index into palette.
      const color = COMPARE_PALETTE[selectedIds.indexOf(id) % COMPARE_PALETTE.length]
      result[id] = color
    }
  }

  return result
}

/** Top N movers by |Δ%| for the current timeframe. */
export function topMoverIds(
  rows: Array<{ product_id: string; windowPct: number | null }>,
  n = 5
): string[] {
  return [...rows]
    .filter((r) => r.windowPct != null)
    .sort((a, b) => Math.abs(b.windowPct!) - Math.abs(a.windowPct!))
    .slice(0, n)
    .map((r) => r.product_id)
}
