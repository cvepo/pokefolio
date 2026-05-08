import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

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
  const { data, error } = await supabase
    .from("portfolio_items")
    .update(body)
    .eq("id", itemId)
    .select("*, product:products(*)")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
