import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { backfillPriceHistory } from "@/lib/backfill"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const { error } = await supabase.from("portfolio_items").delete().eq("id", itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const body = await request.json()

  // Snapshot old purchase_date before update (only needed if date is changing)
  let oldPurchaseDate: string | null = null
  if (body.purchase_date !== undefined) {
    const { data: existing } = await supabase
      .from("portfolio_items")
      .select("purchase_date")
      .eq("id", itemId)
      .single()
    oldPurchaseDate = existing?.purchase_date ?? null
  }

  const { data, error } = await supabase
    .from("portfolio_items")
    .update(body)
    .eq("id", itemId)
    .select("*, product:products(*)")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Backfill if purchase_date moved earlier (or was set for the first time)
  if (body.purchase_date !== undefined) {
    const newDate: string | null = body.purchase_date ?? null
    const movedEarlier =
      newDate !== null &&
      (oldPurchaseDate === null || new Date(newDate) < new Date(oldPurchaseDate))

    if (movedEarlier) {
      const product = (data as { product?: { variant_id?: string; id?: string } }).product
      if (product?.variant_id && product?.id) {
        await backfillPriceHistory(product.id, product.variant_id, newDate)
      }
    }
  }

  return NextResponse.json(data)
}
