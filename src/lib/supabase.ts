import { createClient } from "@supabase/supabase-js"

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseUrl = rawUrl.startsWith("https://") ? rawUrl : "https://placeholder.supabase.co"
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder_key"

export const supabase = createClient(supabaseUrl, supabaseKey)

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
