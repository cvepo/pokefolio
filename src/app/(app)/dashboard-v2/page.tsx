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
import { ActivityHoldingTabs } from "@/components/dashboard/activity-holding-tabs"
import { useDashboardDensity } from "@/components/dashboard/use-density"
import { useDashboardViewportLock } from "@/components/dashboard/viewport-lock"
import { cn } from "@/lib/utils"

/**
 * Dashboard 2.0 parallel route (decisions.md A6).
 * Reading order follows PRD §10: value → Value Change → What Changed → rest.
 * Viewport-locked terminal shell: one dvh, panes scroll internally.
 */
export default function DashboardV2Page() {
  const [portfolioId, setPortfolioId] = useState<string | undefined>(undefined)
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")
  const [useFixture, setUseFixture] = useState(false)
  const density = useDashboardDensity()
  useDashboardViewportLock()

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
    <div className="dashboard-v2 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden px-3 py-2 gap-2 w-full max-xl:overflow-y-auto max-xl:h-auto max-xl:max-h-none">
      <div className="shrink-0 flex items-center justify-between gap-3 min-w-0">
        <h1 className="text-sm font-bold flex items-center gap-1.5 min-w-0">
          <LayoutDashboard size={14} className="shrink-0" />
          <span className="truncate">Dashboard</span>
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground border border-border rounded-sm px-1 py-px">
            v2
          </span>
        </h1>
        <PortfolioSwitcher
          value={portfolioId ?? "all"}
          onChange={(id) => setPortfolioId(id === "all" ? undefined : id)}
        />
      </div>

      {useFixture && (
        <div className="shrink-0 flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-medium">Fixture data</span>
            {" — "}
            every number below is fake (<code>?fixtures=1</code>).
          </p>
        </div>
      )}

      {loading && !payload ? (
        <DashboardSkeleton />
      ) : error && !payload ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="rounded-sm border border-dashed border-border p-8 text-center space-y-2 max-w-md">
            <AlertCircle className="mx-auto text-muted-foreground" size={24} />
            <p className="font-medium text-sm">Couldn’t load the dashboard</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            {errorHint && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Next step: </span>
                {errorHint}
              </p>
            )}
            <button
              type="button"
              onClick={() => refresh()}
              className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
            >
              Retry
            </button>
          </div>
        </div>
      ) : payload && envelope ? (
        <div
          className={cn(
            "dashboard-v2-grid flex-1 min-h-0 min-w-0 grid tabular-nums gap-2",
            "grid-cols-1 xl:grid-cols-12",
            /* Locked fractional rows from xl up (15"+); stack below */
            "xl:grid-rows-[auto_minmax(0,1.25fr)_minmax(0,1fr)]"
          )}
        >
          {/* Row 1 — value → Value Change → portfolio ticker (PRD §10) */}
          <div className="col-span-1 xl:col-span-12 xl:row-start-1 min-w-0 space-y-1.5">
            <ValueHeader
              summary={payload.summary}
              primaryChange={primaryChange}
              sync={payload.sync}
              asOf={envelope.asOf}
              timeframes={payload.performance.timeframes}
              activeTimeframe={timeframe}
              onSelectTimeframe={setTimeframe}
            />
            <TimeframeRow
              timeframes={payload.performance.timeframes}
              active={timeframe}
              onSelect={setTimeframe}
            />
            <PortfolioStrip summary={payload.summary} ticker />
          </div>

          {/* Row 2 — chart + What Changed (never demoted) */}
          <div
            className={cn(
              "min-h-0 min-w-0 max-xl:min-h-[220px]",
              "col-span-1 xl:col-span-8 xl:row-start-2 3xl:col-span-7 4xl:col-span-6"
            )}
          >
            <ValueChart
              series={payload.performance.series}
              seriesTimeframe={timeframe}
              height={density.chartHeight}
            />
          </div>

          <div
            className={cn(
              "min-h-0 min-w-0 max-xl:min-h-[200px]",
              "col-span-1 xl:col-span-4 xl:row-start-2 3xl:col-span-5 4xl:col-span-3"
            )}
          >
            <WhatChanged insights={payload.insights} displayCap={density.insightCap} />
          </div>

          {/* 4xl: Allocation climbs beside What Changed instead of stretching Activity */}
          {density.tier === "4xl" ? (
            <div className="min-h-0 min-w-0 4xl:row-start-2 4xl:col-span-3">
              <AllocationPanel allocation={payload.allocation} />
            </div>
          ) : (
            <div
              className={cn(
                "min-h-0 min-w-0 max-xl:min-h-[180px]",
                "col-span-1 xl:col-span-3 xl:row-start-3 3xl:col-span-3"
              )}
            >
              <AllocationPanel allocation={payload.allocation} />
            </div>
          )}

          <div
            className={cn(
              "min-h-0 min-w-0 max-xl:min-h-[180px]",
              "xl:row-start-3",
              density.holdingPeriodSeparate
                ? "col-span-1 xl:col-span-3 3xl:col-span-3 4xl:col-span-3"
                : "col-span-1 xl:col-span-4 3xl:col-span-3"
            )}
          >
            {density.holdingPeriodSeparate ? (
              <RecentActivity activity={payload.activity} />
            ) : (
              <ActivityHoldingTabs
                activity={payload.activity}
                positions={payload.positions.positions}
              />
            )}
          </div>

          <div
            className={cn(
              "min-h-0 min-w-0 max-xl:min-h-[200px]",
              "xl:row-start-3",
              density.holdingPeriodSeparate
                ? "col-span-1 xl:col-span-6 3xl:col-span-4 4xl:col-span-6"
                : "col-span-1 xl:col-span-5 3xl:col-span-6"
            )}
          >
            <HoldingsHeatmap positions={payload.positions} />
          </div>

          {density.holdingPeriodSeparate && (
            <div className="min-h-0 min-w-0 col-span-1 3xl:col-span-2 3xl:row-start-3 4xl:col-span-3">
              <HoldingPeriodSummary positions={payload.positions.positions} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 grid-rows-[auto_minmax(0,1.25fr)_minmax(0,1fr)] gap-2">
      <div className="col-span-1 xl:col-span-12 space-y-1.5">
        <div className="h-8 w-48 bg-muted rounded-sm animate-pulse" />
        <div className="h-10 bg-muted rounded-sm animate-pulse" />
      </div>
      <div className="col-span-1 xl:col-span-8 min-h-0 bg-muted rounded-sm animate-pulse" />
      <div className="col-span-1 xl:col-span-4 min-h-0 bg-muted rounded-sm animate-pulse" />
    </div>
  )
}
