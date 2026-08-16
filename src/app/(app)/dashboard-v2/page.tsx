"use client"

import { useEffect, useState } from "react"
import { AlertCircle, LayoutDashboard } from "lucide-react"
import { FIXTURE_ENVELOPE } from "@/lib/dashboard/fixtures"
import type { DashboardPayload, Timeframe } from "@/lib/dashboard/contract"
import { useDashboard } from "@/lib/dashboard/use-dashboard"

/**
 * Dashboard 2.0 parallel route (decisions.md A6).
 * Shell only — sections land in follow-up commits in PRD §10 order.
 */
export default function DashboardV2Page() {
  const [portfolioId] = useState<string | undefined>(undefined)
  const [timeframe] = useState<Timeframe>("1M")
  const [useFixture, setUseFixture] = useState(false)

  const { data, loading, error, refresh } = useDashboard({ portfolioId, timeframe })

  useEffect(() => {
    if (error && !data) setUseFixture(true)
    if (data) setUseFixture(false)
  }, [error, data])

  const envelope = data ?? (useFixture ? FIXTURE_ENVELOPE : null)
  const payload: DashboardPayload | null = envelope?.data ?? null

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard size={22} />
          Dashboard
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
            v2
          </span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Portfolio check-in — Value Change, not return
        </p>
      </div>

      {useFixture && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Showing fixture data</p>
            <p className="text-xs opacity-90">
              {error ?? "/api/dashboard unavailable"}. Sections below use the hostile fixture so edge
              cases stay reviewable until the backend branch merges.
            </p>
          </div>
        </div>
      )}

      {loading && !payload ? (
        <DashboardSkeleton />
      ) : error && !payload ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
          <AlertCircle className="mx-auto text-muted-foreground" size={28} />
          <p className="font-medium">Couldn’t load the dashboard</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            Retry
          </button>
        </div>
      ) : payload && envelope ? (
        <div className="space-y-4 text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6">
          <p className="font-medium text-foreground">Information hierarchy (PRD §10)</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Value + freshness header</li>
            <li>Value chart (Actual / Projected)</li>
            <li>Timeframe row — all six windows</li>
            <li>What Changed</li>
            <li>Portfolio strip · Allocation · Activity · Heatmap · Holding period</li>
          </ol>
          <p className="text-xs">
            Snapshot {envelope.snapshotId} · as of {envelope.asOf} ·{" "}
            {payload.summary.positionCount} positions
          </p>
        </div>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-10 w-56 bg-muted rounded animate-pulse" />
        <div className="h-5 w-72 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-64 bg-muted rounded-xl animate-pulse" />
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-40 bg-muted rounded-xl animate-pulse" />
    </div>
  )
}
