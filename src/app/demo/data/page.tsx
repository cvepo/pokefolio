"use client"

import { useState } from "react"
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react"
import { centsToDollars } from "@/lib/dashboard/contract"
import { useDemoStore } from "@/lib/demo/use-demo-store"
import { formatCurrency, formatPercent } from "@/lib/utils"

export default function DemoDataPage() {
  const store = useDemoStore()
  const portfolios = store.getPortfolios()
  const [scope, setScope] = useState<string>("all")

  const envelope = store.getDashboard(scope === "all" ? undefined : scope, "1M")
  const s = envelope.data.summary
  const positions = envelope.data.positions.positions

  const totalPnL = centsToDollars(s.unrealizedPnl + s.realizedPnl)
  const totalPnLPct =
    s.totalInvested > 0
      ? ((s.realizedPnl + s.unrealizedPnl) / s.totalInvested) * 100
      : null

  const performers = positions
    .filter((p) => p.priceStatus !== "unknown")
    .map((p) => ({ name: p.name, pnl: centsToDollars(p.unrealizedPnl + p.realizedPnl) }))
    .sort((a, b) => b.pnl - a.pnl)
  const best = performers[0] ?? null
  const worst = performers.length ? performers[performers.length - 1] : null

  const sells = store
    .getTransactions(scope === "all" ? undefined : scope)
    .filter((t) => t.type === "sell")

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={22} /> Data
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aggregate P/L across the sample collection
          </p>
        </div>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All portfolios</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BigStat
          label="Total P/L"
          value={formatCurrency(totalPnL)}
          sub={totalPnLPct != null ? formatPercent(totalPnLPct) + " on invested" : undefined}
          tone={totalPnL >= 0 ? "pos" : "neg"}
        />
        <BigStat
          label="Realized"
          value={formatCurrency(centsToDollars(s.realizedPnl))}
          sub={`${sells.length} sell${sells.length === 1 ? "" : "s"} recorded`}
          tone={s.realizedPnl >= 0 ? "pos" : "neg"}
        />
        <BigStat
          label="Unrealized"
          value={formatCurrency(centsToDollars(s.unrealizedPnl))}
          sub={
            s.unrealizedPnlPct != null ? formatPercent(s.unrealizedPnlPct * 100) : "—"
          }
          tone={s.unrealizedPnl >= 0 ? "pos" : "neg"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Invested" value={formatCurrency(centsToDollars(s.totalInvested))} />
        <Stat label="Proceeds" value={formatCurrency(centsToDollars(s.totalProceeds))} />
        <Stat label="Active value" value={formatCurrency(centsToDollars(s.totalValue))} />
        <Stat label="Cost basis" value={formatCurrency(centsToDollars(s.costBasis))} />
        <Stat label="Positions" value={String(s.positionCount)} />
        <Stat label="Units held" value={String(s.unitCount)} />
        <Stat
          label="Best (open)"
          value={best ? best.name : "—"}
          sub={best ? formatCurrency(best.pnl) : undefined}
          tone={best && best.pnl >= 0 ? "pos" : best ? "neg" : undefined}
        />
        <Stat
          label="Worst (open)"
          value={worst ? worst.name : "—"}
          sub={worst ? formatCurrency(worst.pnl) : undefined}
          tone={worst && worst.pnl >= 0 ? "pos" : worst ? "neg" : undefined}
        />
      </div>
    </div>
  )
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "pos" | "neg"
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 tabular-nums ${
          tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : ""
        }`}
      >
        {value}
      </p>
      {sub && (
        <p
          className={`text-xs mt-1 flex items-center gap-1 ${
            tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : "text-muted-foreground"
          }`}
        >
          {tone === "pos" && <TrendingUp size={12} aria-hidden />}
          {tone === "neg" && <TrendingDown size={12} aria-hidden />}
          {sub}
        </p>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "pos" | "neg"
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card min-w-0">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold mt-1 truncate tabular-nums" title={value}>
        {value}
      </p>
      {sub && (
        <p
          className={`text-xs mt-0.5 tabular-nums ${
            tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : "text-muted-foreground"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  )
}
