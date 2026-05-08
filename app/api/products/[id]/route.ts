import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const decodedId = decodeURIComponent(id)

  const [productRes, snapshotsRes] = await Promise.all([
    supabase.from("products").select("*").eq("id", decodedId).single(),
    supabase
      .from("price_snapshots")
      .select("price, snapshot_date")
      .eq("product_id", decodedId)
      .order("snapshot_date", { ascending: true }),
  ])

  if (productRes.error)
    return NextResponse.json({ error: productRes.error.message }, { status: 404 })

  return NextResponse.json({ product: productRes.data, snapshots: snapshotsRes.data ?? [] })
}
