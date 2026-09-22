"use client"

import { useMemo, useState } from "react"
import { LayoutDashboard } from "lucide-react"
import type { DashboardPayload, Timeframe } from "@/lib/dashboard/contract"
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
import { demoHeatmapImageUrl } from "@/lib/demo/image-url"
import { useDemoStore } from "@/lib/demo/use-demo-store"
import { cn } from "@/lib/utils"

/**
 * Demo terminal dashboard — same panes as /dashboard, fed by DemoStore.
 * Fills the layout main pane (already under the demo banner) rather than
 * claiming a second 100dvh.
 */
export default function DemoDashboardPage() {
  const store = useDemoStore()
  const [portfolioId, setPortfolioId] = useState<string | undefined>(undefined)
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")
  const density = useDashboardDensity()
  useDashboardViewportLock()

  const envelope = store.getDashboard(portfolioId, timeframe)
  const payload: DashboardPayload = envelope.data
  const portfolios = store.getPortfolios()

  const primaryChange = useMemo(() => {
    return (
      payload.performance.timeframes.find((t) => t.timeframe === timeframe) ??
      payload.performance.timeframes.find((t) => t.timeframe === "1M") ??
      null
    )
  }, [payload, timeframe])

  return (
    <div className="dashboard-terminal flex h-full max-h-full flex-col overflow-hidden px-3 py-2 gap-2 w-full max-xl:overflow-y-auto max-xl:h-auto max-xl:max-h-none">
      <div className="shrink-0 flex items-center justify-between gap-3 min-w-0">
        <h1 className="text-sm font-bold flex items-center gap-1.5 min-w-0">
          <LayoutDashboard size={14} className="shrink-0" />
          <span className="truncate">Dashboard</span>
        </h1>
        <PortfolioSwitcher
          value={portfolioId ?? "all"}
          onChange={(id) => setPortfolioId(id === "all" ? undefined : id)}
          portfolios={portfolios}
        />
      </div>

      <div
        className={cn(
          "dashboard-terminal-grid flex-1 min-h-0 min-w-0 grid tabular-nums gap-2",
          "grid-cols-1 xl:grid-cols-12",
          "xl:grid-rows-[auto_minmax(0,1.25fr)_minmax(0,1fr)]"
        )}
      >
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
          <WhatChanged
            insights={payload.insights}
            displayCap={density.insightCap}
            onMarkSeen={() => {
              /* Demo has no persistence for seen state. */
            }}
          />
        </div>

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
          <HoldingsHeatmap positions={payload.positions} imageUrlFor={demoHeatmapImageUrl} />
        </div>

        {density.holdingPeriodSeparate && (
          <div className="min-h-0 min-w-0 col-span-1 3xl:col-span-2 3xl:row-start-3 4xl:col-span-3">
            <HoldingPeriodSummary positions={payload.positions.positions} />
          </div>
        )}
      </div>
    </div>
  )
}
