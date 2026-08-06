/**
 * Shared database types. Safe to import from client components — this module
 * deliberately contains no Supabase client and no credentials.
 *
 * The client itself lives in @/lib/supabase-server and is server-only.
 */

export type Product = {
  id: string
  name: string
  set_id: string
  set_name: string
  tcgplayer_id: string | null
  variant_id: string
  current_price: number | null
  last_synced_at: string | null
}

export type Portfolio = {
  id: string
  name: string
  description: string | null
  created_at: string
}

export type Transaction = {
  id: string
  portfolio_id: string
  product_id: string
  type: "buy" | "sell"
  quantity: number
  price: number
  transaction_date: string
  notes: string | null
  created_at: string
  product?: Product
}

/**
 * "Holding" — a derived view of current ownership of a product in a portfolio,
 * computed from the underlying buy/sell transactions. Returned by GET /api/portfolios/[id]/items.
 */
export type PortfolioItem = {
  product_id: string
  product?: Product
  // current net holding (buys − sells)
  quantity: number
  // average cost basis of remaining (FIFO-unsold) units, $/unit
  purchase_price: number
  // earliest buy date among remaining (FIFO-unsold) lots
  purchase_date: string | null
  realized_pnl: number
  total_buy_qty: number
  total_sell_qty: number
}

export type PriceSnapshot = {
  id: string
  product_id: string
  price: number
  snapshot_date: string
}

export type PortfolioSnapshot = {
  id: string
  portfolio_id: string
  total_value: number
  snapshot_date: string
}

/** How a sync was started. 'cron' = Vercel Cron, 'manual' = user pressed Sync now. */
export type SyncTrigger = "cron" | "manual"

/** 'skipped' means a cron fired on a day outside the schedule — no API calls were made. */
export type SyncStatus = "success" | "partial" | "failed" | "skipped"

export type SyncRun = {
  id: string
  started_at: string
  finished_at: string | null
  trigger: SyncTrigger
  status: SyncStatus
  products_total: number
  products_synced: number
  products_failed: number
  snapshots_written: number
  history_points_written: number
  backfilled_products: number
  api_requests_used: number
  api_daily_remaining: number | null
  api_monthly_remaining: number | null
  error: string | null
  failures: Array<{ product_id: string; name?: string; reason: string }>
}

export type AppSettings = {
  id: number
  /** JS getDay() numbering: 0=Sunday … 6=Saturday. */
  sync_days: number[]
  sync_timezone: string
  updated_at: string
}
