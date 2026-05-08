import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim()

  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 })

  const apiKey = process.env.JUSTTCG_API_KEY
  if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 })

  const url = new URL("https://api.justtcg.com/v1/cards")
  url.searchParams.set("q", q)
  url.searchParams.set("game", "pokemon")
  url.searchParams.set("condition", "S")
  url.searchParams.set("include_price_history", "false")
  url.searchParams.set("include_statistics", "7d")

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: err.error || "JustTCG API error" }, { status: res.status })
  }

  const result = await res.json()
  const cards = (result.data ?? []) as Array<{
    id: string
    name: string
    set: string
    set_name: string
    tcgplayerId: string
    variants: Array<{
      id: string
      condition: string
      printing: string
      price: number
      priceChange7d: number | null
    }>
  }>

  // Only keep cards that have a sealed variant
  const sealedCards = cards.filter((c) => c.variants.some((v) => v.condition === "Sealed"))

  // Upsert into products table (cache)
  if (sealedCards.length > 0) {
    const rows = sealedCards.map((card) => {
      const sealedVariant = card.variants.find((v) => v.condition === "Sealed")!
      return {
        id: card.id,
        name: card.name,
        set_id: card.set,
        set_name: card.set_name,
        tcgplayer_id: card.tcgplayerId ?? null,
        variant_id: sealedVariant.id,
        current_price: sealedVariant.price ?? null,
        last_synced_at: new Date().toISOString(),
      }
    })

    await supabase.from("products").upsert(rows, { onConflict: "id" })
  }

  return NextResponse.json({ data: sealedCards, meta: result.meta, _metadata: result._metadata })
}
