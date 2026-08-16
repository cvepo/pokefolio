"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, LayoutDashboard } from "lucide-react"
import { FIXTURE_ENVELOPE } from "@/lib/dashboard/fixtures"
import type { DashboardPayload, Timeframe } from "@/lib/dashboard/contract"
import { useDashboard } from "@/lib/dashboard/use-dashboard"
import { PortfolioSwitcher } from "@/components/dashboard/portfolio-switcher"
import { ValueHeader } from "@/components/dashboard/value-header"
import { TimeframeRow } from "@/components/dashboard/timeframe-row"
import { ValueChart } from "@/components/dashboard/value-chart"
import { WhatChanged } from "@/components/dashboard/what-changed"
import { PortfolioStrip } from "@/components/dashboard/portfolio-strip"
import { AllocationPanel } from "@/components/dashboard/allocation-panel"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { HoldingsHeatmap } from "@/components/dashboard/holdings-heatmap"
import { HoldingPeriodSummary } from "@/components/dashboard/holding-period"

/**
 * Dashboard 2.0 parallel route (decisions.md A6).
 * Reading order follows PRD §10: value → Value Change → What Changed → rest.
 */
export default function DashboardV2Page() {
  const [portfolioId, setPortfolioId] = useState<string | undefined>(undefined)
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")
  const [useFixture, setUseFixture] = useState(false)

  const { data, loading, error, errorHint, refresh } = useDashboard({ portfolioId, timeframe })

  // Fixtures render every section — including the stale, unknown and
  // missing-history states — without a database behind them.
  //
  // This is opt-in via ?fixtures=1, never automatic. It used to fall back on its
  // own whenever the request failed, which meant a missing migration silently
  // produced a complete, plausible dashboard built from invented numbers. That
  // reads as a miscalculating dashboard rather than an absent one, and the
  // amber banner below was not enough to prevent exactly that confusion.
  //
  // A wrong number is worse than no number here: the entire point of PRD §12 is
  // that the dashboard must never misrepresent the state of its own data.
  useEffect(() => {
    if (typeof window === "undefined") return
    const wanted = new URLSearchParams(window.location.search).get("fixtures") === "1"
    setUseFixture(wanted && process.env.NODE_ENV === "development")
  }, [])

  const envelope = data ?? (useFixture ? FIXTURE_ENVELOPE : null)
  const payload: DashboardPayload | null = envelope?.data ?? null

  const primaryChange = useMemo(() => {
    if (!payload) return null
    return (
      payload.performance.timeframes.find((t) => t.timeframe === timeframe) ??
      payload.performance.timeframes.find((t) => t.timeframe === "1M") ??
      null
    )
  }, [payload, timeframe])

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
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
        <PortfolioSwitcher
          value={portfolioId ?? "all"}
          onChange={(id) => setPortfolioId(id === "all" ? undefined : id)}
        />
      </div>

      {useFixture && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              Every number below is fake — this is fixture data, not your portfolio
            </p>
            <p className="text-xs opacity-90">
              Rendered because <code>?fixtures=1</code> is set, so the stale, unknown and
              missing-history states stay reviewable without a database. Remove it from the URL
              to see real data.
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
          {errorHint && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              <span className="font-medium text-foreground">Next step: </span>
              {errorHint}
            </p>
          )}
          <button
            type="button"
            onClick={() => refresh()}
            className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            Retry
          </button>
        </div>
      ) : payload && envelope ? (
        <>
          <ValueHeader
            summary={payload.summary}
            primaryChange={primaryChange}
            sync={payload.sync}
            asOf={envelope.asOf}
          />

          <ValueChart
            series={payload.performance.series}
            seriesTimeframe={timeframe}
          />

          <TimeframeRow
            timeframes={payload.performance.timeframes}
            active={timeframe}
            onSelect={setTimeframe}
          />

          <WhatChanged insights={payload.insights} />

          <PortfolioStrip summary={payload.summary} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AllocationPanel allocation={payload.allocation} />
            <RecentActivity activity={payload.activity} />
          </div>

          <HoldingsHeatmap positions={payload.positions} />

          <HoldingPeriodSummary positions={payload.positions.positions} />
        </>
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
