import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { backfillPriceHistory } from "@/lib/backfill"

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
  // Use the earliest purchase_date among items holding that product as the cutoff.
  const { data: itemsWithDates } = await supabase
    .from("portfolio_items")
    .select("product_id, purchase_date")
    .in("product_id", productIds)

  const earliestByProduct: Record<string, string | null> = {}
  for (const it of itemsWithDates ?? []) {
    const curr = earliestByProduct[it.product_id]
    if (curr === undefined) {
      earliestByProduct[it.product_id] = it.purchase_date
    } else if (it.purchase_date && (curr === null || new Date(it.purchase_date) < new Date(curr))) {
      earliestByProduct[it.product_id] = it.purchase_date
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

  // Rebuild portfolio_snapshots from full price history (so dashboard chart
  // reflects backfilled product price data, not just today's value).
  const { data: allItems } = await supabase
    .from("portfolio_items")
    .select("portfolio_id, product_id, quantity, purchase_date, purchase_price")

  if (allItems?.length) {
    // Pull all price snapshots for products held in any portfolio
    const { data: allPriceSnaps } = await supabase
      .from("price_snapshots")
      .select("product_id, price, snapshot_date")
      .in("product_id", productIds)

    // Index prices: product_id -> sorted [{ date, price }]
    const pricesByProduct: Record<string, { date: string; price: number }[]> = {}
    for (const snap of allPriceSnaps ?? []) {
      const arr = pricesByProduct[snap.product_id] ?? (pricesByProduct[snap.product_id] = [])
      arr.push({ date: snap.snapshot_date, price: Number(snap.price) })
    }
    for (const arr of Object.values(pricesByProduct)) {
      arr.sort((a, b) => a.date.localeCompare(b.date))
    }

    // Determine the date range to compute (earliest purchase across all items → today)
    let earliest: string | null = null
    for (const it of allItems) {
      if (it.purchase_date && (earliest === null || it.purchase_date < earliest)) {
        earliest = it.purchase_date
      }
    }
    // If no purchase_date set, fall back to earliest snapshot date
    if (earliest === null) {
      for (const arr of Object.values(pricesByProduct)) {
        if (arr.length && (earliest === null || arr[0].date < earliest)) {
          earliest = arr[0].date
        }
      }
    }

    const portfolioSnapshotRows: Array<{
      portfolio_id: string
      total_value: number
      snapshot_date: string
    }> = []

    if (earliest) {
      // Iterate every day from earliest → today
      const dates: string[] = []
      const cursor = new Date(earliest + "T00:00:00Z")
      const end = new Date(today + "T00:00:00Z")
      while (cursor <= end) {
        dates.push(cursor.toISOString().split("T")[0])
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }

      // For each (portfolio, date), sum item quantities × most-recent-price-on-or-before-date.
      // Skip items whose purchase_date is after the snapshot date (didn't own it yet).
      const itemsByPortfolio: Record<string, typeof allItems> = {}
      for (const it of allItems) {
        ;(itemsByPortfolio[it.portfolio_id] ??= []).push(it)
      }

      const priceOnOrBefore = (productId: string, date: string): number | null => {
        const arr = pricesByProduct[productId]
        if (!arr?.length) return null
        // binary search for last entry with date <= target
        let lo = 0
        let hi = arr.length - 1
        let found = -1
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1
          if (arr[mid].date <= date) {
            found = mid
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        return found >= 0 ? arr[found].price : null
      }

      for (const date of dates) {
        for (const [portfolio_id, pItems] of Object.entries(itemsByPortfolio)) {
          let total = 0
          let anyOwned = false
          for (const it of pItems) {
            if (it.purchase_date && it.purchase_date > date) continue // didn't own yet
            anyOwned = true
            // Prefer historical market price; if none exists yet (date earlier
            // than oldest snapshot we have), fall back to purchase price so
            // the chart shows a flat cost-basis line instead of a fake jump.
            const market = priceOnOrBefore(it.product_id, date)
            const price = market ?? Number(it.purchase_price)
            total += price * it.quantity
          }
          if (anyOwned) {
            portfolioSnapshotRows.push({ portfolio_id, total_value: total, snapshot_date: date })
          }
        }
      }
    }

    if (portfolioSnapshotRows.length > 0) {
      // Upsert in chunks to avoid payload limits
      const CHUNK = 500
      for (let i = 0; i < portfolioSnapshotRows.length; i += CHUNK) {
        await supabase.from("portfolio_snapshots").upsert(
          portfolioSnapshotRows.slice(i, i + CHUNK),
          { onConflict: "portfolio_id,snapshot_date" }
        )
      }
    }
  }

  return NextResponse.json({
    ok: true,
    synced: Object.keys(updatedPrices).length,
    date: today,
    apiUsage,
  })
}
