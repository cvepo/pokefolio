"use client"

import type { PortfolioSummary } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import { cn } from "@/lib/utils"

type PortfolioStripProps = {
  summary: PortfolioSummary
  /** Stack metrics vertically — used in the narrow 3xl sidebar slot. */
  compact?: boolean
}

export function PortfolioStrip({ summary, compact = false }: PortfolioStripProps) {
  const cells = [
    {
      label: "Cost basis",
      value: formatCents(summary.costBasis),
      sub: `${summary.positionCount} positions · ${summary.unitCount} units`,
      tone: "neutral" as const,
    },
    {
      label: "Unrealized P/L",
      value: formatCents(summary.unrealizedPnl),
      sub:
        summary.unrealizedPnlPct == null
          ? "—"
          : formatValueChangePct(summary.unrealizedPnlPct),
      tone: summary.unrealizedPnl >= 0 ? ("pos" as const) : ("neg" as const),
    },
    {
      label: "Realized P/L",
      value: formatCents(summary.realizedPnl),
      sub: "Closed lots (FIFO)",
      tone: summary.realizedPnl >= 0 ? ("pos" as const) : ("neg" as const),
    },
    {
      label: "Net cash flow",
      value: formatCents(summary.netCashFlow),
      sub: "−invested + proceeds",
      tone: summary.netCashFlow >= 0 ? ("pos" as const) : ("neg" as const),
    },
  ]

  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Portfolio
      </h2>
      <div
        className={cn(
          "grid gap-2",
          compact ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4 gap-3"
        )}
      >
        {cells.map((c) => (
          <div
            key={c.label}
            className={cn(
              "rounded-md border border-border bg-card space-y-0.5",
              compact ? "px-2.5 py-2" : "px-4 py-3 space-y-1"
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p
              className={cn(
                "font-bold tabular-nums",
                compact ? "text-sm" : "text-lg",
                c.tone === "pos" && "text-emerald-500",
                c.tone === "neg" && "text-red-500"
              )}
            >
              {c.value}
            </p>
            <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
              {c.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
