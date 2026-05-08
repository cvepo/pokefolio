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

export type PortfolioItem = {
  id: string
  portfolio_id: string
  product_id: string
  quantity: number
  purchase_price: number
  purchase_date: string | null
  notes: string | null
  created_at: string
  product?: Product
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
