"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import type {
  PortfolioSummary,
  SyncStatusPayload,
  ValueChange,
} from "@/lib/dashboard/contract"
import {
  formatCents,
  formatValueChangePair,
  isPositiveChange,
} from "@/lib/dashboard/format"
import { syncPillTone, syncStateLabel, syncSuccessLabel } from "@/lib/dashboard/sync-label"
import { cn } from "@/lib/utils"

type ValueHeaderProps = {
  summary: PortfolioSummary
  primaryChange: ValueChange | null
  sync: SyncStatusPayload
  asOf: string
}

export function ValueHeader({ summary, primaryChange, sync, asOf }: ValueHeaderProps) {
  const tone = primaryChange ? isPositiveChange(primaryChange.valueChangePct) : null
  const pair =
    primaryChange != null
      ? formatValueChangePair(primaryChange.valueChangeAbs, primaryChange.valueChangePct)
      : "—"

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="space-y-1">
        <p className="text-4xl font-bold tabular-nums">{formatCents(summary.totalValue)}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Portfolio value</p>
        {primaryChange && pair !== "—" ? (
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              tone === true && "text-emerald-500",
              tone === false && "text-red-500",
              tone == null && "text-muted-foreground"
            )}
          >
            {tone === true && <TrendingUp size={16} aria-hidden />}
            {tone === false && <TrendingDown size={16} aria-hidden />}
            <span>
              {pair}
              <span className="text-muted-foreground font-normal">
                {" "}
                · {primaryChange.timeframe} (Value Change)
              </span>
            </span>
            {!primaryChange.hasFullHistory && (
              <span
                className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded"
                title="History starts after this window began"
              >
                Partial history
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">—</span> Value Change (need more history)
          </p>
        )}
      </div>

      <SyncFreshnessPill sync={sync} asOf={asOf} />
    </div>
  )
}

function SyncFreshnessPill({ sync, asOf }: { sync: SyncStatusPayload; asOf: string }) {
  const tone = syncPillTone(sync.state)
  return (
    <div
      className={cn(
        "inline-flex flex-col items-end gap-0.5 rounded-lg border px-3 py-2 text-right",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/5",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10",
        tone === "bad" && "border-red-500/40 bg-red-500/10",
        tone === "info" && "border-sky-500/40 bg-sky-500/10"
      )}
      title={`Snapshot as of ${asOf}`}
    >
      <span
        className={cn(
          "text-xs font-semibold flex items-center gap-1.5",
          tone === "ok" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-700 dark:text-amber-300",
          tone === "bad" && "text-red-600 dark:text-red-400",
          tone === "info" && "text-sky-600 dark:text-sky-400"
        )}
      >
        <span aria-hidden>
          {tone === "ok" && "●"}
          {tone === "warn" && "⚠"}
          {tone === "bad" && "✕"}
          {tone === "info" && "…"}
        </span>
        {syncSuccessLabel(sync)}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {syncStateLabel(sync.state)}
        {sync.stalePositionCount > 0 ? ` · ${sync.stalePositionCount} stale` : ""}
        {sync.productsFailed > 0 ? ` · ${sync.productsFailed} failed` : ""}
      </span>
    </div>
  )
}
