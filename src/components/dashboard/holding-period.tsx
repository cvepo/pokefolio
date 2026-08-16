"use client"

import type { Position } from "@/lib/dashboard/contract"
import { formatAgeDays, rollupHoldingPeriod } from "@/lib/dashboard/holding-period"
import { formatSnapshotDate } from "@/lib/utils"

type HoldingPeriodSummaryProps = {
  positions: Position[]
}

export function HoldingPeriodSummary({ positions }: HoldingPeriodSummaryProps) {
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

  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Holding period
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card px-4 py-3 space-y-1"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="text-lg font-bold tabular-nums">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
