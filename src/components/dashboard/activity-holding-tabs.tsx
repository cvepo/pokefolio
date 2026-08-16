"use client"

import { useState } from "react"
import type { ActivityPayload } from "@/lib/dashboard/contract"
import type { Position } from "@/lib/dashboard/contract"
import { DashboardPanel } from "@/components/dashboard/panel"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { HoldingPeriodSummary } from "@/components/dashboard/holding-period"
import { cn } from "@/lib/utils"

type ActivityHoldingTabsProps = {
  activity: ActivityPayload
  positions: Position[]
}

type Tab = "activity" | "holding"

/**
 * Below 1920px Holding period shares a pane with Activity (PRD priority:
 * never drop What Changed or the value chart to free vertical budget).
 */
export function ActivityHoldingTabs({ activity, positions }: ActivityHoldingTabsProps) {
  const [tab, setTab] = useState<Tab>("activity")

  return (
    <DashboardPanel
      title={tab === "activity" ? "Recent activity" : "Holding period"}
      actions={
        <div className="flex gap-0.5 p-0.5 rounded-sm border border-border bg-background/50">
          {(
            [
              ["activity", "Activity"],
              ["holding", "Holding"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "px-1.5 py-0 text-[10px] font-medium transition-colors rounded-sm",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      }
      bodyClassName="!p-1.5"
    >
      {tab === "activity" ? (
        <RecentActivity activity={activity} bare />
      ) : (
        <HoldingPeriodSummary positions={positions} bare compact />
      )}
    </DashboardPanel>
  )
}
