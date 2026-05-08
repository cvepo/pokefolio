"use client"

import { useEffect, useState } from "react"
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react"
import { Portfolio } from "@/lib/supabase"
import { formatCurrency, formatPercent } from "@/lib/utils"

type Stats = {
  totalInvested: number
  totalProceeds: number
  netCashFlow: number
  totalRealized: number
  totalUnrealized: number
  totalBuyQty: number
  totalSellQty: number
  totalSells: number
  profitableSells: number
  winRate: number | null
  bestPerformer: { name: string; pnl: number } | null
  worstPerformer: { name: string; pnl: number } | null
  activeHoldingsValue: number
  activeHoldingsCost: number
}

export default function DataPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [scope, setScope] = useState<string>("all") // "all" or portfolioId
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => setPortfolios(Array.isArray(data) ? data : []))
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = scope === "all" ? "/api/data" : `/api/data?portfolioId=${scope}`
    fetch(url).then((r) => r.json()).then((data) => {
      setStats(data)
      setLoading(false)
    })
  }, [scope])

  const totalPnL = (stats?.totalRealized ?? 0) + (stats?.totalUnrealized ?? 0)
  const totalCost = (stats?.activeHoldingsCost ?? 0)
  const totalPnLPct =
    stats && stats.totalInvested > 0
      ? ((stats.totalRealized + stats.totalUnrealized) / stats.totalInvested) * 100
      : null

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={22} /> Data
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aggregate performance across your portfolios
          </p>
        </div>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All portfolios</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading || !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Top P/L row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <BigStat
              label="Total P/L"
              value={formatCurrency(totalPnL)}
              sub={totalPnLPct != null ? formatPercent(totalPnLPct) + " on invested" : undefined}
              tone={totalPnL >= 0 ? "pos" : "neg"}
            />
            <BigStat
              label="Realized"
              value={formatCurrency(stats.totalRealized)}
              sub={`${stats.profitableSells} of ${stats.totalSells} sells profitable`}
              tone={stats.totalRealized >= 0 ? "pos" : "neg"}
            />
            <BigStat
              label="Unrealized"
              value={formatCurrency(stats.totalUnrealized)}
              sub={
                totalCost > 0
                  ? formatPercent((stats.totalUnrealized / totalCost) * 100) + " on holdings"
                  : undefined
              }
              tone={stats.totalUnrealized >= 0 ? "pos" : "neg"}
            />
          </div>

          {/* Cash flow */}
          <div className="border border-border rounded-lg bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cash flow</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Total invested" value={formatCurrency(stats.totalInvested)} />
              <Stat label="Total proceeds" value={formatCurrency(stats.totalProceeds)} />
              <Stat
                label="Net cash flow"
                value={formatCurrency(stats.netCashFlow)}
                tone={stats.netCashFlow >= 0 ? "pos" : "neg"}
              />
            </div>
          </div>

          {/* Quantity */}
          <div className="border border-border rounded-lg bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quantity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Total bought" value={String(stats.totalBuyQty)} />
              <Stat label="Total sold" value={String(stats.totalSellQty)} />
              <Stat label="Currently held" value={String(stats.totalBuyQty - stats.totalSellQty)} />
              <Stat
                label="Win rate"
                value={stats.winRate != null ? `${(stats.winRate * 100).toFixed(0)}%` : "—"}
              />
            </div>
          </div>

          {/* Best / worst */}
          {(stats.bestPerformer || stats.worstPerformer) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stats.bestPerformer && (
                <div className="border border-border rounded-lg bg-card p-5 flex items-center gap-3">
                  <div className="p-2.5 rounded-md bg-emerald-500/15 text-emerald-500"><TrendingUp size={20} /></div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Best performer</p>
                    <p className="font-semibold truncate">{stats.bestPerformer.name}</p>
                    <p className={`text-sm font-medium ${stats.bestPerformer.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatCurrency(stats.bestPerformer.pnl)}
                    </p>
                  </div>
                </div>
              )}
              {stats.worstPerformer && (
                <div className="border border-border rounded-lg bg-card p-5 flex items-center gap-3">
                  <div className="p-2.5 rounded-md bg-red-500/15 text-red-500"><TrendingDown size={20} /></div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Worst performer</p>
                    <p className="font-semibold truncate">{stats.worstPerformer.name}</p>
                    <p className={`text-sm font-medium ${stats.worstPerformer.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatCurrency(stats.worstPerformer.pnl)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BigStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : ""
  return (
    <div className="border border-border rounded-lg bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold mt-1.5 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : ""
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}
