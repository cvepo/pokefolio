import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { rebuildPortfolioSnapshots } from "@/lib/rebuild-portfolio-snapshots"

/**
 * Delete ALL transactions for a given product in a given portfolio.
 * Used by the trash button on the portfolio detail page.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  const { id, productId } = await params
  const decodedProductId = decodeURIComponent(productId)

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("portfolio_id", id)
    .eq("product_id", decodedProductId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await rebuildPortfolioSnapshots([id])
  return NextResponse.json({ ok: true })
}
