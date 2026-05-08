import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { backfillPriceHistory } from "@/lib/backfill"
import { rebuildPortfolioSnapshots } from "@/lib/rebuild-portfolio-snapshots"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("*, product:products(*)")
    .eq("portfolio_id", id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({ ...body, portfolio_id: id })
    .select("*, product:products(*)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed price history back to purchase date, then rebuild portfolio snapshots
  const product = (data as { product?: { variant_id?: string } }).product
  if (product?.variant_id) {
    await backfillPriceHistory(body.product_id, product.variant_id, body.purchase_date ?? null)
  }
  await rebuildPortfolioSnapshots([id])

  return NextResponse.json(data, { status: 201 })
}
