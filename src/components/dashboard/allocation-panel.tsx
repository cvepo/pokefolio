"use client"

import { useState } from "react"
import type { AllocationBucket, PortfolioAllocation } from "@/lib/dashboard/contract"
import { formatCents } from "@/lib/dashboard/format"
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
    <section className="border border-border rounded-md bg-card p-3 3xl:p-4 space-y-2 h-full">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Allocation
        </h2>
        <div className="flex gap-0.5 p-0.5 rounded border border-border bg-background/50">
          {(
            [
              ["set", "By set"],
              ["category", "By category"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGroup(id)}
              className={cn(
                "px-2 py-0.5 rounded-sm text-[11px] font-medium transition-colors",
                group === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">No allocation data.</p>
      ) : (
        <ul className="space-y-2">
          {buckets.map((b) => (
            <AllocationRow key={b.key} bucket={b} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AllocationRow({ bucket }: { bucket: AllocationBucket }) {
  const pct = Math.max(0, Math.min(100, bucket.share * 100))
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium truncate">{bucket.label}</span>
        <span className="tabular-nums text-muted-foreground shrink-0 text-[13px]">
          {formatShare(bucket.share)} · {formatCents(bucket.value)}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-cyan-500/80"
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
      <p className="text-[10px] text-muted-foreground tabular-nums">
        {bucket.positionCount} position{bucket.positionCount === 1 ? "" : "s"}
      </p>
    </li>
  )
}
