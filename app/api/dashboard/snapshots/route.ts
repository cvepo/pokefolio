import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const portfolioId = searchParams.get("portfolioId")

  const query = supabase
    .from("portfolio_snapshots")
    .select("*")
    .order("snapshot_date", { ascending: true })

  if (portfolioId) query.eq("portfolio_id", portfolioId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
