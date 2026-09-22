import type { Timeframe } from "@/lib/dashboard/contract"
import { buildPriceIndex, fetchAllPriceSnapshots } from "@/lib/price-lookup"
import { supabase } from "@/lib/supabase-server"
import { expectedSyncWindowDays, getAppSettings } from "@/lib/sync-log"
import {
  computeAnalytics,
  type AnalyticsProduct,
  type AnalyticsTransaction,
} from "./compute"
import { persistInsightTransitions } from "./insights/persistence"

type Source = { syncRunId?: string; transactionId?: string }

/** Recomputes from stored domain data only. This function never calls a pricing API. */
export async function publishAnalyticsSnapshot(
  opts: {
    portfolioId?: string
    timeframe?: Timeframe
    source?: Source
    asOf?: Date
  } = {}
): Promise<string> {
  const startedAt = new Date().toISOString()
  const asOf = opts.asOf ?? new Date()
  const today = asOf.toISOString().slice(0, 10)

  // Readers only select published rows. Keeping the snapshot pending until all
  // child rows and payloads exist makes the final status change the atomic
  // visibility boundary for a complete analytics version.
  const { data: pending, error: startError } = await supabase
    .from("analytics_snapshots")
    .insert({
      as_of: asOf.toISOString(),
      scope_portfolio_id: opts.portfolioId ?? null,
      source_sync_run_id: opts.source?.syncRunId ?? null,
      source_transaction_id: opts.source?.transactionId ?? null,
      status: "pending",
      started_at: startedAt,
    })
    .select("id")
    .single()
  if (startError || !pending) {
    throw new Error(startError?.message ?? "Could not start analytics snapshot")
  }
  const snapshotId = (pending as { id: string }).id

  try {
    let txQuery = supabase.from("transactions").select("*, product:products(*)")
    if (opts.portfolioId) txQuery = txQuery.eq("portfolio_id", opts.portfolioId)

    const [
      { data: txRows, error: txError },
      { data: portfolios },
      { data: lastRun },
      settings,
    ] = await Promise.all([
      txQuery,
      supabase.from("portfolios").select("id,name"),
      supabase
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getAppSettings(),
    ])
    if (txError) throw new Error(txError.message)

    const transactions = (txRows ?? []) as AnalyticsTransaction[]
    const productById = new Map<string, AnalyticsProduct>()
    for (const transaction of transactions) {
      if (transaction.product) productById.set(transaction.product_id, transaction.product)
    }
    const productIds = [...new Set(transactions.map((transaction) => transaction.product_id))]
    const snapshots = await fetchAllPriceSnapshots(supabase, productIds)
    const result = computeAnalytics({
      today,
      transactions,
      products: [...productById.values()],
      priceIndex: buildPriceIndex(snapshots),
      portfolios: (portfolios ?? []) as Array<{ id: string; name: string }>,
      lastSyncFailures:
        ((lastRun as { failures?: Array<{ product_id: string }> } | null)?.failures ?? []),
      timeframe: opts.timeframe,
      expectedSyncWindowDays: expectedSyncWindowDays(settings),
    })
    const { summary, performance, allocation, activity, positions } = result

    if (positions.length) {
      await supabase.from("snapshot_positions").insert(
        positions.map((position) => ({
          snapshot_id: snapshotId,
          product_id: position.productId,
          position,
        }))
      )
    }

    // Transition state is global per product today. Only the combined scope
    // may advance it; otherwise each portfolio publish could consume another
    // scope's transition and make insight generation depend on publish order.
    const insightsCreated = opts.portfolioId
      ? 0
      : await persistInsightTransitions(snapshotId, positions, asOf.toISOString())

    // This is deliberately the last successful write. Published readers cannot
    // observe the positions or events above until their owning snapshot crosses
    // this status boundary.
    const { error: publishError } = await supabase
      .from("analytics_snapshots")
      .update({
        status: "published",
        completed_at: new Date().toISOString(),
        products_requested: productIds.length,
        products_updated: positions.length,
        products_failed: positions.filter((position) => position.priceStatus !== "ok").length,
        insights_created: insightsCreated,
        summary,
        performance,
        allocation,
        activity,
      })
      .eq("id", snapshotId)
      .eq("status", "pending")
    if (publishError) throw new Error(publishError.message)

    return snapshotId
  } catch (error) {
    await supabase
      .from("analytics_snapshots")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", snapshotId)
    throw error
  }
}
