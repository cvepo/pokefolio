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
import { useDashboardDensity } from "@/components/dashboard/use-density"
import { cn } from "@/lib/utils"

/**
 * Dashboard 2.0 parallel route (decisions.md A6).
 * Reading order follows PRD §10: value → Value Change → What Changed → rest.
 * Grid spans claim horizontal space on 15"/23"/27" while keeping that priority
 * top-left and largest at every tier.
 */
export default function DashboardV2Page() {
  const [portfolioId, setPortfolioId] = useState<string | undefined>(undefined)
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")
  const [useFixture, setUseFixture] = useState(false)
  const density = useDashboardDensity()

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
    <div className="w-full max-w-dashboard mx-auto p-4 xl:p-5 3xl:p-6 space-y-4 xl:space-y-3 3xl:space-y-2.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg xl:text-xl font-bold flex items-center gap-2">
            <LayoutDashboard size={18} />
            Dashboard
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
              v2
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Portfolio check-in — Value Change, not return
          </p>
        </div>
        <PortfolioSwitcher
          value={portfolioId ?? "all"}
          onChange={(id) => setPortfolioId(id === "all" ? undefined : id)}
        />
      </div>

      {useFixture && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
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
        <div className="rounded-lg border border-dashed border-border p-10 text-center space-y-3">
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
        <div
          className={cn(
            "grid grid-cols-1 xl:grid-cols-12",
            "gap-4 xl:gap-3 3xl:gap-2.5 4xl:gap-2"
          )}
        >
          {/* Ticker: value + Value Change windows + freshness — §10 Q1/Q2 */}
          <div className="col-span-1 xl:col-span-12 order-1 space-y-3 xl:space-y-2">
            <ValueHeader
              summary={payload.summary}
              primaryChange={primaryChange}
              sync={payload.sync}
              asOf={envelope.asOf}
            />
            <TimeframeRow
              timeframes={payload.performance.timeframes}
              active={timeframe}
              onSelect={setTimeframe}
            />
          </div>

          <div className="col-span-1 xl:col-span-8 3xl:col-span-7 4xl:col-span-6 order-2 min-w-0">
            <ValueChart
              series={payload.performance.series}
              seriesTimeframe={timeframe}
              height={density.chartHeight}
            />
          </div>

          <div className="col-span-1 xl:col-span-4 3xl:col-span-3 4xl:col-span-3 order-3 min-w-0">
            <WhatChanged insights={payload.insights} displayCap={density.insightCap} />
          </div>

          {/*
            Portfolio strip: full width on laptop; narrow sidebar on 23";
            half-width bottom row on 27". order jumps at 4xl so Allocation
            can sit beside the chart instead.
          */}
          <div className="col-span-1 xl:col-span-12 3xl:col-span-2 4xl:col-span-6 order-4 4xl:order-7 min-w-0">
            <PortfolioStrip
              summary={payload.summary}
              compact={density.tier === "3xl"}
            />
          </div>

          <div className="col-span-1 xl:col-span-6 3xl:col-span-4 4xl:col-span-3 order-5 4xl:order-4 min-w-0">
            <AllocationPanel allocation={payload.allocation} />
          </div>

          <div className="col-span-1 xl:col-span-6 3xl:col-span-4 4xl:col-span-4 order-6 min-w-0">
            <RecentActivity activity={payload.activity} />
          </div>

          <div className="col-span-1 xl:col-span-12 4xl:col-span-8 order-7 3xl:order-8 4xl:order-5 min-w-0">
            <HoldingsHeatmap positions={payload.positions} tier={density.tier} />
          </div>

          <div className="col-span-1 xl:col-span-12 3xl:col-span-4 4xl:col-span-6 order-8 3xl:order-7 4xl:order-8 min-w-0">
            <HoldingPeriodSummary positions={payload.positions.positions} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <div className="col-span-1 xl:col-span-12 space-y-2">
        <div className="h-9 w-56 bg-muted rounded animate-pulse" />
        <div className="h-14 bg-muted rounded-md animate-pulse" />
      </div>
      <div className="col-span-1 xl:col-span-8 h-[280px] bg-muted rounded-md animate-pulse" />
      <div className="col-span-1 xl:col-span-4 h-[280px] bg-muted rounded-md animate-pulse" />
    </div>
  )
}
