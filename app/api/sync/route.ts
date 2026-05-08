import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

const BATCH_SIZE = 20 // free plan limit per batch request

// GET is called by Vercel Cron (authenticated via middleware x-cron-secret check)
export async function GET() {
  return syncPrices()
}

// POST is called by the manual trigger in settings
export async function POST() {
  return syncPrices()
}

async function syncPrices() {
  const apiKey = process.env.JUSTTCG_API_KEY
  if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 })

  // Get all distinct products in any portfolio
  const { data: items, error: itemsError } = await supabase
    .from("portfolio_items")
    .select("product_id")

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const productIds = [...new Set((items ?? []).map((i) => i.product_id))]
  if (productIds.length === 0) {
    return NextResponse.json({ ok: true, message: "No products to sync", synced: 0 })
  }

  // Load variant IDs for these products
  const { data: products } = await supabase
    .from("products")
    .select("id, variant_id")
    .in("id", productIds)

  if (!products?.length) {
    return NextResponse.json({ ok: true, message: "No products found", synced: 0 })
  }

  const today = new Date().toISOString().split("T")[0]
  const updatedPrices: Record<string, number> = {}
  let apiUsage = null

  // Batch fetch prices (20 per request)
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    const body = batch.map((p) => ({ variantId: p.variant_id }))

    const res = await fetch("https://api.justtcg.com/v1/cards", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) continue

    const result = await res.json()
    if (result._metadata) apiUsage = result._metadata

    const cards = result.data ?? []
    for (const card of cards) {
      const sealedVariant = card.variants?.find(
        (v: { condition: string; price: number }) => v.condition === "Sealed"
      )
      if (sealedVariant?.price != null) {
        updatedPrices[card.id] = sealedVariant.price
      }
    }

    // Rate limit: 10 req/min on free plan — add small delay between batches
    if (i + BATCH_SIZE < products.length) {
      await new Promise((r) => setTimeout(r, 6500))
    }
  }

  // Update current_price in products table
  await Promise.all(
    Object.entries(updatedPrices).map(([id, price]) =>
      supabase
        .from("products")
        .update({ current_price: price, last_synced_at: new Date().toISOString() })
        .eq("id", id)
    )
  )

  // Insert price snapshots (skip if already exists today)
  const snapshotRows = Object.entries(updatedPrices).map(([product_id, price]) => ({
    product_id,
    price,
    snapshot_date: today,
  }))

  if (snapshotRows.length > 0) {
    await supabase.from("price_snapshots").upsert(snapshotRows, {
      onConflict: "product_id,snapshot_date",
    })
  }

  // Compute and store portfolio snapshots
  const { data: allItems } = await supabase
    .from("portfolio_items")
    .select("portfolio_id, product_id, quantity")

  if (allItems?.length) {
    const portfolioTotals: Record<string, number> = {}
    for (const item of allItems) {
      const price = updatedPrices[item.product_id] ?? 0
      portfolioTotals[item.portfolio_id] =
        (portfolioTotals[item.portfolio_id] ?? 0) + price * item.quantity
    }

    const portfolioSnapshotRows = Object.entries(portfolioTotals).map(
      ([portfolio_id, total_value]) => ({
        portfolio_id,
        total_value,
        snapshot_date: today,
      })
    )

    await supabase.from("portfolio_snapshots").upsert(portfolioSnapshotRows, {
      onConflict: "portfolio_id,snapshot_date",
    })
  }

  return NextResponse.json({
    ok: true,
    synced: Object.keys(updatedPrices).length,
    date: today,
    apiUsage,
  })
}
