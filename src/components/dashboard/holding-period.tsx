"use client"

import type { Position } from "@/lib/dashboard/contract"
import { formatAgeDays, rollupHoldingPeriod } from "@/lib/dashboard/holding-period"
import { formatSnapshotDate } from "@/lib/utils"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

type HoldingPeriodSummaryProps = {
  positions: Position[]
  /** When false, omit the panel chrome (used inside a shared Activity/Holding tab). */
  bare?: boolean
  /** Single-row compact strip for tight vertical budgets. */
  compact?: boolean
}

export function HoldingPeriodSummary({
  positions,
  bare = false,
  compact = false,
}: HoldingPeriodSummaryProps) {
  const rollup = rollupHoldingPeriod(positions)

  const cells = [
    {
      label: "Value-weighted age",
      value: formatAgeDays(rollup.valueWeightedAgeDays),
      sub: "Open lots weighted by current value",
    },
    {
      label: "Oldest open lot",
      value:
        rollup.oldestOpenLotAgeDays == null
          ? "—"
          : formatAgeDays(rollup.oldestOpenLotAgeDays),
      sub:
        rollup.oldestOpenLotDate == null
          ? "No open lots"
          : `Bought ${formatSnapshotDate(rollup.oldestOpenLotDate)}`,
    },
    {
      label: "Approaching 1 year",
      value: String(rollup.lotsApproachingOneYear),
      sub: "Lots aged 335–364 days",
    },
  ]

  const body = (
    <div
      className={cn(
        "grid gap-1.5",
        compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"
      )}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          className={cn(
            "rounded-sm border border-border bg-background/40 space-y-0.5",
            compact ? "px-2 py-1.5" : "px-2.5 py-2"
          )}
        >
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {c.label}
          </p>
          <p className={cn("font-bold tabular-nums", compact ? "text-xs" : "text-sm")}>
            {c.value}
          </p>
          {!compact && (
            <p className="text-[10px] text-muted-foreground leading-snug">{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  )

  if (bare) return body

  return (
    <DashboardPanel title="Holding period" bodyClassName="!p-1.5">
      {body}
    </DashboardPanel>
  )
}
