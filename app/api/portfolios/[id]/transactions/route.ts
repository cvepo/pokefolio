import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { backfillPriceHistory } from "@/lib/backfill"
import { rebuildPortfolioSnapshots } from "@/lib/rebuild-portfolio-snapshots"
import { checkOversell } from "@/lib/holdings"
import type { Transaction } from "@/lib/supabase"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")

  let q = supabase
    .from("transactions")
    .select("*, product:products(*)")
    .eq("portfolio_id", id)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true })

  if (productId) q = q.eq("product_id", productId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  // Validate
  const type = body.type
  if (type !== "buy" && type !== "sell") {
    return NextResponse.json({ error: "type must be 'buy' or 'sell'" }, { status: 400 })
  }
  const quantity = Number.parseInt(body.quantity, 10)
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 })
  }
  const price = Number.parseFloat(body.price)
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 })
  }
  if (!body.transaction_date) {
    return NextResponse.json({ error: "transaction_date is required" }, { status: 400 })
  }
  if (!body.product_id) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 })
  }

  // Block overselling
  if (type === "sell") {
    const { data: existing } = await supabase
      .from("transactions")
      .select("*")
      .eq("portfolio_id", id)
      .eq("product_id", body.product_id)
    const err = checkOversell((existing ?? []) as Transaction[], quantity)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      portfolio_id: id,
      product_id: body.product_id,
      type,
      quantity,
      price,
      transaction_date: body.transaction_date,
      notes: body.notes ?? null,
    })
    .select("*, product:products(*)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For buys, seed price history back to the transaction date.
  if (type === "buy") {
    const product = (data as { product?: { variant_id?: string } }).product
    if (product?.variant_id) {
      await backfillPriceHistory(body.product_id, product.variant_id, body.transaction_date)
    }
  }

  // Always rebuild snapshots for this portfolio so the chart reflects the change.
  await rebuildPortfolioSnapshots([id])

  return NextResponse.json(data, { status: 201 })
}
