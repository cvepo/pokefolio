/**
 * Demo mode — the seam between the demo data layer and the demo UI.
 *
 * THIS FILE IS THE INTERFACE BETWEEN THE TWO DEMO WORKSTREAMS.
 * Owned by the integrator. Neither side may edit it unilaterally — if a shape
 * here is wrong, say so rather than changing it locally, because the other side
 * is building against this exact file in parallel.
 *
 * ## Why demo mode holds its own data
 *
 * The demo is public — no password — so recruiters can open it cold. That makes
 * any shared path to the real database a liability: one bad filter on one public
 * endpoint would expose real holdings. So demo mode never touches Supabase at
 * all. It cannot leak what it cannot reach.
 *
 * The trade normally made for that safety is a dead, read-only mock. This avoids
 * that: the demo runs the *same pure calculations* as production —
 * `computeHoldings` (FIFO), `classifyExitReviewSignal`, the insight rules,
 * `squarify` — over transactions held in browser memory. Adding a purchase in
 * the demo recomputes cost basis, P/L, allocation, the heatmap and What Changed
 * for real, because it is the same code, not an imitation of it.
 *
 * That is also what PRD §21 asks for: no financial calculation independently
 * reimplemented per surface.
 *
 * @see docs/dashboard-2.0/decisions.md
 */

import type {
  ApiEnvelope,
  DashboardPayload,
  IsoDate,
  Timeframe,
} from "@/lib/dashboard/contract"
import type { CompareSeriesResponse } from "@/lib/compare-series"

// ---------------------------------------------------------------------------
// Frozen dataset — generated from real data, committed as a static module
// ---------------------------------------------------------------------------

/** A product in the demo catalog. Mirrors the `products` table. */
export type DemoProduct = {
  id: string
  name: string
  set_id: string
  set_name: string
  tcgplayer_id: string | null
  variant_id: string
  /** Price on the frozen date. Null for catalog products never priced. */
  current_price: number | null
}

/**
 * Price history for one product, stored column-wise to keep the committed
 * fixture small — ~20 products x ~500 dates is 10k points, and repeating a
 * `{product_id, snapshot_date, price}` object per point would bloat the bundle.
 */
export type DemoPriceSeries = {
  productId: string
  /** Ascending, "YYYY-MM-DD". Same length as `prices`. */
  dates: IsoDate[]
  /** Dollars, aligned index-for-index with `dates`. */
  prices: number[]
}

/** A seeded demo transaction. Mirrors the `transactions` table. */
export type DemoTransaction = {
  id: string
  portfolio_id: string
  product_id: string
  type: "buy" | "sell"
  quantity: number
  price: number
  transaction_date: IsoDate
  notes: string | null
  created_at: string
}

export type DemoPortfolio = {
  id: string
  name: string
  description: string | null
  created_at: string
}

/**
 * The complete frozen dataset shipped with the app.
 *
 * Generated from the real database by a script, then committed — the demo must
 * not depend on network access or on the live catalog still containing a given
 * product.
 */
export type DemoDataset = {
  /** The date the data was frozen. Demo "today" — see `DemoStore.today`. */
  asOf: IsoDate
  portfolios: DemoPortfolio[]
  /**
   * Every product a visitor can find via Search. Most have no price history;
   * that is honest and the UI already renders it as `priceStatus: "unknown"`.
   */
  catalog: DemoProduct[]
  /**
   * Price history, only for products that have it. Seeded holdings are chosen
   * from these so signals, Compare and the heatmap have real data to work with.
   */
  priceHistory: DemoPriceSeries[]
  /** Seeded buys and sells — the starting portfolio a visitor lands on. */
  transactions: DemoTransaction[]
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/**
 * A visitor's sandbox: the frozen dataset plus whatever they have changed.
 *
 * Mutations are per-visitor and per-tab, never shared and never persisted
 * server-side, so one person adding nonsense cannot affect the next — and a
 * fresh tab always starts from the seeded portfolio.
 */
export type DemoState = {
  /** Seeded transactions plus any the visitor added, minus any they deleted. */
  transactions: DemoTransaction[]
  /** True once the visitor has changed anything, so the UI can offer a reset. */
  dirty: boolean
}

export type AddTransactionInput = {
  portfolioId: string
  productId: string
  type: "buy" | "sell"
  quantity: number
  /** Dollars per unit, as typed by the visitor. */
  price: number
  date: IsoDate
  notes?: string | null
}

/**
 * Everything the demo UI is allowed to do.
 *
 * Deliberately mirrors the real API surface so demo pages differ from live
 * pages by data source only, not by logic. Every method is synchronous: there
 * is no network, and pretending otherwise would add loading states that exist
 * purely to look busy.
 */
export type DemoStore = {
  /**
   * The dataset's frozen date, used everywhere production would use "now".
   * Using the real current date instead would make every holding age past the
   * frozen prices and quietly drift the demo's numbers over time.
   */
  readonly today: IsoDate

  readonly state: DemoState

  /** Same shape `/api/dashboard` returns, computed from current sandbox state. */
  getDashboard(portfolioId: string | undefined, timeframe: Timeframe): ApiEnvelope<DashboardPayload>

  getPortfolios(): DemoPortfolio[]
  getProduct(productId: string): DemoProduct | null

  /** Case-insensitive name/set search over the frozen catalog. */
  searchProducts(query: string, limit?: number): DemoProduct[]

  /** Transactions for one portfolio, or all when omitted. Newest first. */
  getTransactions(portfolioId?: string): DemoTransaction[]

  /**
   * Add a buy or sell. Returns an error message when it would oversell —
   * the same guard `checkOversell` applies in production, so the demo cannot
   * reach a state the real app would reject.
   */
  addTransaction(input: AddTransactionInput): { ok: true } | { ok: false; error: string }

  deleteTransaction(transactionId: string): void

  /**
   * Per-product price history for the Compare page, in the same shape
   * `/api/compare/series` returns.
   *
   * Added after the first build: the contract originally exposed no way to
   * reach price history, so the demo Compare page could only show a table and
   * had no chart. The frozen dataset has full series for every seeded holding,
   * so the real ComparisonChart works here — it just needed a way in.
   */
  getCompareSeries(): CompareSeriesResponse

  /** Discard every change and return to the seeded portfolio. */
  reset(): void
}
