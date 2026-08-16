import { supabase } from "@/lib/supabase-server"
import { getAppSettings, nextScheduledDescription } from "@/lib/sync-log"
import type {
  ActivityPayload,
  ApiEnvelope,
  DashboardPayload,
  InsightsPayload,
  PortfolioAllocation,
  PortfolioPerformance,
  PortfolioSummary,
  PositionsPayload,
  SyncState,
  SyncStatusPayload,
  Timeframe,
} from "./contract"

type Snapshot = {
  id: string
  as_of: string
  summary: PortfolioSummary
  performance: PortfolioPerformance & {
    seriesByTimeframe?: Record<Timeframe, PortfolioPerformance["series"]>
  }
  allocation: PortfolioAllocation
  activity: ActivityPayload
}

export class NoPublishedSnapshotError extends Error {}

export async function latestSnapshot(portfolioId?: string): Promise<Snapshot> {
  let query = supabase
    .from("analytics_snapshots")
    .select("id,as_of,summary,performance,allocation,activity")
    .eq("status", "published")
    .order("as_of", { ascending: false })
    .limit(1)
  query = portfolioId
    ? query.eq("scope_portfolio_id", portfolioId)
    : query.is("scope_portfolio_id", null)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    throw new NoPublishedSnapshotError("No published analytics snapshot exists for this scope")
  }
  return data as Snapshot
}

export function envelope<T>(snapshot: Snapshot, data: T): ApiEnvelope<T> {
  return {
    asOf: snapshot.as_of,
    snapshotId: snapshot.id,
    currency: "USD",
    data,
  }
}

export async function summaryData(portfolioId?: string, snapshot?: Snapshot) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))
  return envelope(resolved, resolved.summary)
}

export async function performanceData(
  portfolioId: string | undefined,
  timeframe: Timeframe,
  snapshot?: Snapshot
) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))
  return envelope(resolved, {
    ...resolved.performance,
    seriesTimeframe: timeframe,
    series:
      resolved.performance.seriesByTimeframe?.[timeframe] ?? resolved.performance.series,
  })
}

export async function positionsData(portfolioId?: string, snapshot?: Snapshot) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))
  const { data, error } = await supabase
    .from("snapshot_positions")
    .select("position")
    .eq("snapshot_id", resolved.id)
  if (error) throw new Error(error.message)

  return envelope<PositionsPayload>(resolved, {
    positions: (data ?? []).map((row) => row.position),
    heatmapColorDomain: { min: -0.25, max: 0.25 },
  })
}

export async function allocationData(portfolioId?: string, snapshot?: Snapshot) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))
  return envelope(resolved, resolved.allocation)
}

export async function activityData(
  portfolioId: string | undefined,
  limit: number,
  snapshot?: Snapshot
) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))
  return envelope(resolved, {
    items: resolved.activity.items.slice(0, limit),
    totalCount: resolved.activity.totalCount,
  })
}

export async function insightsData(portfolioId?: string, snapshot?: Snapshot) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))

  // Events are written while their owning snapshot is pending. The inner join
  // keeps a failed or incomplete run invisible, matching the snapshot reader's
  // published-only boundary.
  let query = supabase
    .from("insight_events")
    .select("*,product:products(name,set_name),snapshot:analytics_snapshots!inner(status)")
    .eq("analytics_snapshots.status", "published")
    .or(
      `state.eq.active,resolved_at.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString()}`
    )
    .order("severity", { ascending: false })

  if (portfolioId) {
    // Insight transition state is global per product, so scoped snapshots do
    // not own separate event rows. Restrict the global event log to products
    // present in the already-pinned scoped snapshot instead.
    const { data: held } = await supabase
      .from("snapshot_positions")
      .select("product_id")
      .eq("snapshot_id", resolved.id)
    const ids = (held ?? []).map((row) => row.product_id)
    if (!ids.length) {
      return envelope<InsightsPayload>(resolved, {
        events: [],
        activeCount: 0,
        unseenCount: 0,
        totalCount: 0,
      })
    }
    query = query.in("entity_id", ids)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const events = (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    category: row.payload?.category ?? "needs_attention",
    state: row.state,
    severity: Number(row.severity),
    entityId: row.entity_id,
    entityName: row.product?.name ?? row.entity_id,
    setName: row.product?.set_name ?? "",
    headline: row.payload?.headline ?? row.type,
    detail: row.payload?.detail ?? null,
    triggeredAt: row.triggered_at,
    resolvedAt: row.resolved_at,
    seenAt: row.seen_at,
    snapshotId: row.snapshot_id,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
  })) as InsightsPayload["events"]

  return envelope<InsightsPayload>(resolved, {
    events,
    activeCount: events.filter((event) => event.state === "active").length,
    unseenCount: events.filter((event) => event.state === "active" && !event.seenAt).length,
    totalCount: events.length,
  })
}

export async function syncData(portfolioId?: string, snapshot?: Snapshot) {
  const resolved = snapshot ?? (await latestSnapshot(portfolioId))
  const [{ data: runs }, settings] = await Promise.all([
    supabase
      .from("sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
    getAppSettings(),
  ])
  const latest = runs?.[0] ?? null
  const success =
    runs?.find((run) => run.status === "success" || run.status === "partial") ?? null
  const age = success
    ? Date.now() - new Date(success.finished_at ?? success.started_at).getTime()
    : Infinity
  const state: SyncState =
    latest?.finished_at == null
      ? "in_progress"
      : latest?.status === "failed"
        ? "failed"
        : latest?.status === "partial"
          ? "partially_priced"
          : age > 36 * 3_600_000
            ? "stale"
            : "fresh"
  const payload: SyncStatusPayload = {
    state,
    lastAttemptedAt: latest?.started_at ?? null,
    lastAttemptStatus: latest?.status ?? null,
    lastSuccessfulAt: success?.finished_at ?? success?.started_at ?? null,
    productsTotal: latest?.products_total ?? 0,
    productsSynced: latest?.products_synced ?? 0,
    productsFailed: latest?.products_failed ?? 0,
    failures: (latest?.failures ?? []).map(
      (failure: { product_id: string; name?: string; reason: string }) => ({
        productId: failure.product_id,
        name: failure.name ?? null,
        reason: failure.reason,
      })
    ),
    stalePositionCount: resolved.summary.stalePositionCount,
    nextScheduledDescription: nextScheduledDescription(settings),
  }
  return envelope(resolved, payload)
}

export async function dashboardData(
  portfolioId: string | undefined,
  timeframe: Timeframe,
  limit: number
): Promise<ApiEnvelope<DashboardPayload>> {
  // Resolve once before fan-out so a concurrent publish cannot combine domains
  // from two analytics versions in a single dashboard response.
  const snapshot = await latestSnapshot(portfolioId)
  const [summary, performance, positions, allocation, activity, insights, sync] =
    await Promise.all([
      summaryData(portfolioId, snapshot),
      performanceData(portfolioId, timeframe, snapshot),
      positionsData(portfolioId, snapshot),
      allocationData(portfolioId, snapshot),
      activityData(portfolioId, limit, snapshot),
      insightsData(portfolioId, snapshot),
      syncData(portfolioId, snapshot),
    ])

  return {
    asOf: snapshot.as_of,
    snapshotId: snapshot.id,
    currency: "USD",
    data: {
      summary: summary.data,
      performance: performance.data,
      positions: positions.data,
      allocation: allocation.data,
      activity: activity.data,
      insights: insights.data,
      sync: sync.data,
    },
  }
}
