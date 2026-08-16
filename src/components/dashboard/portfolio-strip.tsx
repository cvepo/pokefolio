"use client"

import type { PortfolioSummary } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import { cn } from "@/lib/utils"

type PortfolioStripProps = {
  summary: PortfolioSummary
}

export function PortfolioStrip({ summary }: PortfolioStripProps) {
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
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Portfolio
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card px-4 py-3 space-y-1"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p
              className={cn(
                "text-lg font-bold tabular-nums",
                c.tone === "pos" && "text-emerald-500",
                c.tone === "neg" && "text-red-500"
              )}
            >
              {c.value}
            </p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
