"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import type {
  PortfolioSummary,
  SyncStatusPayload,
  Timeframe,
  ValueChange,
} from "@/lib/dashboard/contract"
import { TIMEFRAMES } from "@/lib/dashboard/contract"
import {
  formatCents,
  formatValueChangePair,
  formatValueChangePct,
  isPositiveChange,
} from "@/lib/dashboard/format"
import { syncPillTone, syncStateLabel, syncSuccessLabel } from "@/lib/dashboard/sync-label"
import { cn } from "@/lib/utils"

type ValueHeaderProps = {
  summary: PortfolioSummary
  primaryChange: ValueChange | null
  sync: SyncStatusPayload
  asOf: string
  /** When set, timeframes render inline in the ticker at ≥xl. */
  timeframes?: ValueChange[]
  activeTimeframe?: Timeframe
  onSelectTimeframe?: (tf: Timeframe) => void
}

/**
 * Top strip: total value (hero) → Value Change → optional timeframe chips → sync.
 * At ≥xl this reads as one dense ticker row (Bloomberg-style).
 */
export function ValueHeader({
  summary,
  primaryChange,
  sync,
  asOf,
  timeframes,
  activeTimeframe,
  onSelectTimeframe,
}: ValueHeaderProps) {
  const tone = primaryChange ? isPositiveChange(primaryChange.valueChangePct) : null
  const pair =
    primaryChange != null
      ? formatValueChangePair(primaryChange.valueChangeAbs, primaryChange.valueChangePct)
      : "—"
  const showInlineTimeframes =
    timeframes != null && activeTimeframe != null && onSelectTimeframe != null

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        "xl:flex-row xl:items-center xl:gap-4 xl:flex-wrap 3xl:flex-nowrap"
      )}
    >
      <div className="flex items-baseline gap-3 shrink-0 min-w-0">
        <div>
          <p className="text-3xl xl:text-[2rem] 3xl:text-4xl font-bold tabular-nums leading-none tracking-tight">
            {formatCents(summary.totalValue)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
            Portfolio value
          </p>
        </div>

        {primaryChange && pair !== "—" ? (
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-medium tabular-nums",
              tone === true && "text-emerald-500",
              tone === false && "text-red-500",
              tone == null && "text-muted-foreground"
            )}
          >
            {tone === true && <TrendingUp size={14} aria-hidden />}
            {tone === false && <TrendingDown size={14} aria-hidden />}
            <span>
              {pair}
              <span className="text-muted-foreground font-normal">
                {" "}
                · {primaryChange.timeframe} (Value Change)
              </span>
            </span>
            {!primaryChange.hasFullHistory && (
              <span
                className="text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded"
                title="History starts after this window began"
              >
                Partial history
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium">—</span> Value Change (need more history)
          </p>
        )}
      </div>

      {showInlineTimeframes && (
        <div className="hidden xl:flex flex-1 items-stretch gap-1.5 min-w-0">
          {TIMEFRAMES.map((tf) => {
            const row = timeframes.find((t) => t.timeframe === tf)
            const pct = row?.valueChangePct ?? null
            const chipTone = isPositiveChange(pct)
            const incomplete = row != null && !row.hasFullHistory
            const active = activeTimeframe === tf

            return (
              <button
                key={tf}
                type="button"
                onClick={() => onSelectTimeframe(tf)}
                className={cn(
                  "flex-1 min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-accent/40"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tf}
                  </span>
                  {incomplete && (
                    <span
                      className="text-[8px] font-medium uppercase text-amber-600 dark:text-amber-400"
                      title="Shorter span than the label implies"
                    >
                      Partial
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-xs font-bold tabular-nums mt-0.5",
                    pct == null && "text-muted-foreground",
                    chipTone === true && "text-emerald-500",
                    chipTone === false && "text-red-500"
                  )}
                >
                  {formatValueChangePct(pct)}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <div className="xl:ml-auto shrink-0">
        <SyncFreshnessPill sync={sync} asOf={asOf} />
      </div>
    </div>
  )
}

function SyncFreshnessPill({ sync, asOf }: { sync: SyncStatusPayload; asOf: string }) {
  const tone = syncPillTone(sync.state)
  return (
    <div
      className={cn(
        "inline-flex flex-col items-end gap-0.5 rounded-md border px-2.5 py-1.5 text-right",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/5",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10",
        tone === "bad" && "border-red-500/40 bg-red-500/10",
        tone === "info" && "border-sky-500/40 bg-sky-500/10"
      )}
      title={`Snapshot as of ${asOf}`}
    >
      <span
        className={cn(
          "text-[11px] font-semibold flex items-center gap-1.5 tabular-nums",
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
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {syncStateLabel(sync.state)}
        {sync.stalePositionCount > 0 ? ` · ${sync.stalePositionCount} stale` : ""}
        {sync.productsFailed > 0 ? ` · ${sync.productsFailed} failed` : ""}
      </span>
    </div>
  )
}
