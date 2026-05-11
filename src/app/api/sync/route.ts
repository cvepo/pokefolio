import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { backfillPriceHistory } from "@/lib/backfill"
import { rebuildPortfolioSnapshots } from "@/lib/rebuild-portfolio-snapshots"

// Vercel Hobby default function timeout is 10s, which isn't enough once we
// have ~20 products (each backfill is a separate JustTCG call with retries
// + the rebuild walks the full date range). Cap at 60s.
export const maxDuration = 60

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

  // Get all distinct products held across any portfolio (from transactions).
  const { data: txs, error: itemsError } = await supabase
    .from("transactions")
    .select("product_id")

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const productIds = [...new Set((txs ?? []).map((t) => t.product_id))]
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
        (v: { condition: string; price: number }) => v.condition === "S" || v.condition === "Sealed"
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

  // Backfill historical price snapshots for any product that lacks history.
  // Use the earliest 'buy' transaction_date for that product as the cutoff.
  const { data: buyTxs } = await supabase
    .from("transactions")
    .select("product_id, transaction_date")
    .eq("type", "buy")
    .in("product_id", productIds)

  const earliestByProduct: Record<string, string | null> = {}
  for (const t of buyTxs ?? []) {
    const curr = earliestByProduct[t.product_id]
    if (curr === undefined) {
      earliestByProduct[t.product_id] = t.transaction_date
    } else if (curr === null || t.transaction_date < curr) {
      earliestByProduct[t.product_id] = t.transaction_date
    }
  }

  for (const product of products) {
    const cutoff = earliestByProduct[product.id] ?? null
    await backfillPriceHistory(product.id, product.variant_id, cutoff)
  }

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

  // Rebuild portfolio_snapshots from full price history
  await rebuildPortfolioSnapshots()

  return NextResponse.json({
    ok: true,
    synced: Object.keys(updatedPrices).length,
    date: today,
    apiUsage,
  })
}
