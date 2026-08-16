"use client"

import type { PortfolioSummary } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import { cn } from "@/lib/utils"

type PortfolioStripProps = {
  summary: PortfolioSummary
  /** Stack metrics vertically — used in the narrow 3xl sidebar slot. */
  compact?: boolean
  /** Single hairline ticker row for the viewport-locked auto header. */
  ticker?: boolean
}

export function PortfolioStrip({
  summary,
  compact = false,
  ticker = false,
}: PortfolioStripProps) {
  const cells = [
    {
      label: "Cost basis",
      value: formatCents(summary.costBasis),
      sub: `${summary.positionCount} pos · ${summary.unitCount} u`,
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
      sub: "FIFO closed",
      tone: summary.realizedPnl >= 0 ? ("pos" as const) : ("neg" as const),
    },
    {
      label: "Net cash flow",
      value: formatCents(summary.netCashFlow),
      sub: "−inv + proceeds",
      tone: summary.netCashFlow >= 0 ? ("pos" as const) : ("neg" as const),
    },
  ]

  if (ticker) {
    return (
      <section
        className="flex items-stretch divide-x divide-border rounded-sm border border-border bg-card overflow-hidden min-w-0"
        aria-label="Portfolio"
      >
        {cells.map((c) => (
          <div
            key={c.label}
            className="flex-1 min-w-0 px-2 py-1 flex flex-col justify-center gap-0"
          >
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground truncate">
              {c.label}
            </p>
            <p
              className={cn(
                "text-xs font-bold tabular-nums leading-tight truncate",
                c.tone === "pos" && "text-emerald-500",
                c.tone === "neg" && "text-red-500"
              )}
            >
              {c.value}
            </p>
          </div>
        ))}
      </section>
    )
  }

  return (
    <section className="flex flex-col min-h-0 min-w-0 h-full">
      <h2 className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
        Portfolio
      </h2>
      <div
        className={cn(
          "grid gap-1.5 flex-1 min-h-0",
          compact ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4"
        )}
      >
        {cells.map((c) => (
          <div
            key={c.label}
            className={cn(
              "rounded-sm border border-border bg-card space-y-0.5",
              compact ? "px-2 py-1.5" : "px-2.5 py-2"
            )}
          >
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {c.label}
            </p>
            <p
              className={cn(
                "font-bold tabular-nums",
                compact ? "text-xs" : "text-sm",
                c.tone === "pos" && "text-emerald-500",
                c.tone === "neg" && "text-red-500"
              )}
            >
              {c.value}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{c.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
