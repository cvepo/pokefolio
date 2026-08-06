import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase-server"
import { backfillPriceHistory } from "@/lib/backfill"
import { rebuildPortfolioSnapshots } from "@/lib/rebuild-portfolio-snapshots"
import {
  finishSyncRun,
  getAppSettings,
  isScheduledToday,
  startSyncRun,
  weekdayInTimeZone,
} from "@/lib/sync-log"
import type { SyncTrigger } from "@/lib/supabase"

// Vercel Hobby's default function timeout is 10s, which isn't enough once we
// have ~20 products. Cap at 60s (the Hobby maximum).
export const maxDuration = 60

const BATCH_SIZE = 20 // JustTCG free plan limit per batch request

// JustTCG free tier allows 10 requests/minute. The batch call is 1 request;
// each backfill is another. Cap backfills per run so a sync can never approach
// either the rate limit or the 60s function ceiling.
const MAX_BACKFILL_PER_RUN = 4
const RATE_LIMIT_SPACING_MS = 6500

// A product with at least this many snapshots in the trailing 30 days has
// healthy history and doesn't need an expensive per-product backfill.
const HEALTHY_SNAPSHOTS_30D = 20

type JustTcgVariant = {
  id: string
  condition: string
  price: number | null
  priceHistory?: Array<{ t: number; p: number }> | null
}
type JustTcgCard = { id: string; variants?: JustTcgVariant[] }

/**
 * Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET` — it
 * cannot send custom headers. `x-cron-secret` is kept for manual curl/testing.
 * Anything else reaching this route has already passed the password cookie
 * check in proxy.ts, so it's a human pressing "Sync now".
 */
function detectTrigger(request: Request): SyncTrigger {
  const secret = process.env.CRON_SECRET
  if (!secret) return "manual"
  if (request.headers.get("x-cron-secret") === secret) return "cron"
  if (request.headers.get("authorization") === `Bearer ${secret}`) return "cron"
  return "manual"
}

export async function GET(request: Request) {
  return syncPrices(detectTrigger(request))
}

export async function POST(request: Request) {
  return syncPrices(detectTrigger(request))
}

async function syncPrices(trigger: SyncTrigger) {
  const apiKey = process.env.JUSTTCG_API_KEY
  if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 })

  const settings = await getAppSettings()

  // A scheduled run on an off day exits before spending a single API call.
  // Manual runs always proceed regardless of schedule.
  if (trigger === "cron" && !isScheduledToday(settings)) {
    const runId = await startSyncRun(trigger)
    const today = weekdayInTimeZone(settings.sync_timezone)
    await finishSyncRun(runId, { status: "skipped" })
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: `Not a scheduled sync day (weekday ${today}). No API requests used.`,
    })
  }

  const runId = await startSyncRun(trigger)
  let apiRequestsUsed = 0

  try {
    // 1) Which products do we actually hold?
    const { data: txs, error: txError } = await supabase.from("transactions").select("product_id")
    if (txError) throw new Error(txError.message)

    const productIds = [...new Set((txs ?? []).map((t) => t.product_id))]
    if (productIds.length === 0) {
      await finishSyncRun(runId, { status: "success", products_total: 0 })
      return NextResponse.json({ ok: true, message: "No products to sync", synced: 0 })
    }

    const { data: products } = await supabase
      .from("products")
      .select("id, name, variant_id")
      .in("id", productIds)

    if (!products?.length) {
      await finishSyncRun(runId, { status: "failed", error: "No product rows found" })
      return NextResponse.json({ ok: true, message: "No products found", synced: 0 })
    }

    // Match API responses by variant_id rather than card id. A JustTCG set
    // re-slug changes the card id while our product row keeps its original id,
    // so keying off card.id silently writes prices to the wrong product (or
    // to none at all). variant_id is what we asked for, so it's what we match.
    const productByVariant = new Map(products.map((p) => [p.variant_id, p]))

    const today = new Date().toISOString().split("T")[0]
    const updatedPrices: Record<string, number> = {}
    const historyRows: Array<{ product_id: string; price: number; snapshot_date: string }> = []
    let apiUsage: Record<string, number> | null = null

    // 2) Batch fetch current prices. The batch response also carries a short
    //    priceHistory window per variant at no extra request cost — we persist
    //    it, which is what keeps daily coverage dense without per-product calls.
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      const body = batch.map((p) => ({ variantId: p.variant_id }))

      const res = await fetch("https://api.justtcg.com/v1/cards", {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      apiRequestsUsed += 1

      if (!res.ok) {
        console.error(`[sync] batch ${i / BATCH_SIZE} failed: HTTP ${res.status} ${await res.text()}`)
        continue
      }

      const result = await res.json()
      if (result._metadata) apiUsage = result._metadata

      for (const card of (result.data ?? []) as JustTcgCard[]) {
        for (const variant of card.variants ?? []) {
          const product = productByVariant.get(variant.id)
          if (!product) continue

          if (variant.price != null) {
            updatedPrices[product.id] = variant.price
          }
          for (const point of variant.priceHistory ?? []) {
            if (point?.p == null || !Number.isFinite(point.t)) continue
            historyRows.push({
              product_id: product.id,
              price: point.p,
              snapshot_date: new Date(point.t * 1000).toISOString().split("T")[0],
            })
          }
        }
      }

      if (i + BATCH_SIZE < products.length) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_SPACING_MS))
      }
    }

    const syncedIds = new Set(Object.keys(updatedPrices))
    const failures = products
      .filter((p) => !syncedIds.has(p.id))
      .map((p) => ({ product_id: p.id, name: p.name, reason: "no_price_returned" }))

    for (const f of failures) {
      console.warn(`[sync] no price returned for ${f.name} (${f.product_id})`)
    }

    // 3) PERSIST FIRST. Everything below this point is optional repair work
    //    that may time out; today's prices must already be durable by then.
    //    The previous ordering ran ~20 sequential API calls before this write,
    //    so a timeout lost the whole day's data.
    const snapshotRows = Object.entries(updatedPrices).map(([product_id, price]) => ({
      product_id,
      price,
      snapshot_date: today,
    }))

    if (snapshotRows.length > 0) {
      await supabase.from("price_snapshots").upsert(snapshotRows, {
        onConflict: "product_id,snapshot_date",
      })
      await Promise.all(
        Object.entries(updatedPrices).map(([id, price]) =>
          supabase
            .from("products")
            .update({ current_price: price, last_synced_at: new Date().toISOString() })
            .eq("id", id)
        )
      )
    }

    // Dedupe history points — the API can return the same date twice, and
    // upsert with a composite conflict target rejects duplicate keys in one
    // payload rather than merging them.
    if (historyRows.length > 0) {
      const seen = new Map<string, { product_id: string; price: number; snapshot_date: string }>()
      for (const row of historyRows) seen.set(`${row.product_id}::${row.snapshot_date}`, row)
      const deduped = [...seen.values()]
      const CHUNK = 500
      for (let i = 0; i < deduped.length; i += CHUNK) {
        await supabase
          .from("price_snapshots")
          .upsert(deduped.slice(i, i + CHUNK), { onConflict: "product_id,snapshot_date" })
      }
    }

    // 4) Repair pass — only for products whose recent history is actually
    //    sparse, capped per run. Previously this ran for every product on
    //    every sync, which was both the timeout and rate-limit driver.
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)
    const cutoff = thirtyDaysAgo.toISOString().split("T")[0]

    const { data: recentSnaps } = await supabase
      .from("price_snapshots")
      .select("product_id")
      .in("product_id", productIds)
      .gte("snapshot_date", cutoff)

    const recentCount = new Map<string, number>()
    for (const row of recentSnaps ?? []) {
      recentCount.set(row.product_id, (recentCount.get(row.product_id) ?? 0) + 1)
    }

    const needsBackfill = products
      .map((p) => ({ product: p, count: recentCount.get(p.id) ?? 0 }))
      .filter((x) => x.count < HEALTHY_SNAPSHOTS_30D)
      .sort((a, b) => a.count - b.count)
      .slice(0, MAX_BACKFILL_PER_RUN)

    const { data: buyTxs } = await supabase
      .from("transactions")
      .select("product_id, transaction_date")
      .eq("type", "buy")
      .in("product_id", productIds)

    const earliestByProduct: Record<string, string> = {}
    for (const t of buyTxs ?? []) {
      const curr = earliestByProduct[t.product_id]
      if (!curr || t.transaction_date < curr) earliestByProduct[t.product_id] = t.transaction_date
    }

    for (let i = 0; i < needsBackfill.length; i++) {
      const { product } = needsBackfill[i]
      await backfillPriceHistory(product.id, product.variant_id, earliestByProduct[product.id] ?? null)
      apiRequestsUsed += 1
      if (i < needsBackfill.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_SPACING_MS))
      }
    }

    // 5) Rebuild derived portfolio totals. No external calls.
    await rebuildPortfolioSnapshots()

    const status =
      snapshotRows.length === 0 ? "failed" : failures.length > 0 ? "partial" : "success"

    await finishSyncRun(runId, {
      status,
      products_total: products.length,
      products_synced: snapshotRows.length,
      products_failed: failures.length,
      snapshots_written: snapshotRows.length,
      history_points_written: historyRows.length,
      backfilled_products: needsBackfill.length,
      api_requests_used: apiRequestsUsed,
      api_daily_remaining: apiUsage?.apiDailyRequestsRemaining ?? null,
      api_monthly_remaining: apiUsage?.apiRequestsRemaining ?? null,
      failures,
    })

    return NextResponse.json({
      ok: true,
      synced: snapshotRows.length,
      total: products.length,
      failed: failures.length,
      historyPoints: historyRows.length,
      backfilled: needsBackfill.length,
      apiRequestsUsed,
      date: today,
      trigger,
      apiUsage,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown sync error"
    console.error("[sync] failed:", message)
    await finishSyncRun(runId, {
      status: "failed",
      error: message,
      api_requests_used: apiRequestsUsed,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
