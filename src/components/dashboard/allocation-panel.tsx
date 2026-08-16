"use client"

import { useState } from "react"
import type { AllocationBucket, PortfolioAllocation } from "@/lib/dashboard/contract"
import { formatCents } from "@/lib/dashboard/format"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

type AllocationPanelProps = {
  allocation: PortfolioAllocation
}

type Grouping = "set" | "category"

export function AllocationPanel({ allocation }: AllocationPanelProps) {
  const [group, setGroup] = useState<Grouping>("set")
  const buckets = group === "set" ? allocation.bySet : allocation.byCategory

  return (
    <DashboardPanel
      title="Allocation"
      actions={
        <div className="flex gap-0.5 p-0.5 rounded-sm border border-border bg-background/50">
          {(
            [
              ["set", "Set"],
              ["category", "Cat"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGroup(id)}
              className={cn(
                "px-1.5 py-0 text-[10px] font-medium transition-colors rounded-sm",
                group === id
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
      {buckets.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No allocation data.</p>
      ) : (
        <ul className="space-y-1.5">
          {buckets.map((b) => (
            <AllocationRow key={b.key} bucket={b} />
          ))}
        </ul>
      )}
    </DashboardPanel>
  )
}

function AllocationRow({ bucket }: { bucket: AllocationBucket }) {
  const pct = Math.max(0, Math.min(100, bucket.share * 100))
  return (
    <li className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-xs leading-[22px]">
        <span className="font-medium truncate">{bucket.label}</span>
        <span className="tabular-nums text-muted-foreground shrink-0 text-[11px]">
          {formatShare(bucket.share)} · {formatCents(bucket.value)}
        </span>
      </div>
      <div className="h-0.5 rounded-none bg-muted overflow-hidden">
        <div
          className="h-full rounded-none bg-cyan-500/80"
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
      <p className="text-[10px] text-muted-foreground tabular-nums leading-none">
        {bucket.positionCount} position{bucket.positionCount === 1 ? "" : "s"}
      </p>
    </li>
  )
}
