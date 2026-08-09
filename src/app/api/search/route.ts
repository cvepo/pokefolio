import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { JustTcgError, searchSealedProducts } from "@/lib/product-lookup"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim()
  // The cache holds only what has been searched or held before, so it can
  // return a narrower set than JustTCG. `?fresh=1` bypasses it when the caller
  // needs the full catalogue rather than a fast answer.
  const forceFresh = searchParams.get("fresh") === "1"

  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 })

  try {
    const result = await searchSealedProducts(supabase, q, { forceFresh })

    return NextResponse.json({
      data: result.candidates,
      // Surfaced so the UI (and debugging) can tell a cached answer from a live
      // one — the same reason Compare carries current_price_source.
      source: result.source,
      _metadata: result.metadata ?? null,
    })
  } catch (err) {
    if (err instanceof JustTcgError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
