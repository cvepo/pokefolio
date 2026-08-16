"use client"

import type { Timeframe, ValueChange } from "@/lib/dashboard/contract"
import { TIMEFRAMES } from "@/lib/dashboard/contract"
import {
  formatValueChangePct,
  isPositiveChange,
} from "@/lib/dashboard/format"
import { cn } from "@/lib/utils"

type TimeframeRowProps = {
  timeframes: ValueChange[]
  active: Timeframe
  onSelect: (tf: Timeframe) => void
}

/**
 * All six windows at once (PRD §11). Shown below xl; at ≥xl the chips live
 * inline in ValueHeader's ticker strip instead.
 */
export function TimeframeRow({ timeframes, active, onSelect }: TimeframeRowProps) {
  const byKey = new Map(timeframes.map((t) => [t.timeframe, t]))

  return (
    <div className="xl:hidden">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Value Change
        </h2>
        <span className="text-[9px] text-muted-foreground">all windows</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
        {TIMEFRAMES.map((tf) => {
          const row = byKey.get(tf)
          const pct = row?.valueChangePct ?? null
          const tone = isPositiveChange(pct)
          const incomplete = row != null && !row.hasFullHistory

          return (
            <button
              key={tf}
              type="button"
              onClick={() => onSelect(tf)}
              className={cn(
                "rounded-sm border px-1.5 py-1.5 text-left transition-colors",
                active === tf
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-accent/40"
              )}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {tf}
                </span>
                {incomplete && (
                  <span
                    className="text-[7px] font-medium uppercase text-amber-600 dark:text-amber-400"
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
                  tone === true && "text-emerald-500",
                  tone === false && "text-red-500"
                )}
              >
                {formatValueChangePct(pct)}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
