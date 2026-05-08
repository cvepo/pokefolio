"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TrendingUp, TrendingDown, FolderOpen } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Portfolio, PortfolioSnapshot } from "@/lib/supabase"
import { formatCurrency, formatPercent } from "@/lib/utils"

type Timeframe = "7D" | "1M" | "3M" | "6M" | "MAX"

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "MAX": Infinity,
}

type PortfolioWithValue = Portfolio & {
  latestValue: number
  costBasis: number
}

export default function DashboardPage() {
  const [portfolios, setPortfolios] = useState<PortfolioWithValue[]>([])
  const [allSnapshots, setAllSnapshots] = useState<PortfolioSnapshot[]>([])
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const portfoliosRes = await fetch("/api/portfolios")
      const portfoliosList: Portfolio[] = await portfoliosRes.json()

      if (!portfoliosList.length) {
        setLoading(false)
        return
      }

      const [itemsResults, snapshotResults] = await Promise.all([
        Promise.all(
          portfoliosList.map((p) =>
            fetch(`/api/portfolios/${p.id}/items`).then((r) => r.json())
          )
        ),
        Promise.all(
          portfoliosList.map((p) =>
            fetch(`/api/dashboard/snapshots?portfolioId=${p.id}`).then((r) => r.json())
          )
        ),
      ])

      const enriched: PortfolioWithValue[] = portfoliosList.map((p, i) => {
        const items = Array.isArray(itemsResults[i]) ? itemsResults[i] : []
        const latestValue = items.reduce(
          (sum: number, item: { product?: { current_price?: number }; purchase_price: number; quantity: number }) =>
            sum + (item.product?.current_price ?? Number(item.purchase_price)) * item.quantity,
          0
        )
        const costBasis = items.reduce(
          (sum: number, item: { purchase_price: number; quantity: number }) =>
            sum + Number(item.purchase_price) * item.quantity,
          0
        )
        return { ...p, latestValue, costBasis }
      })

      const allSnaps: PortfolioSnapshot[] = snapshotResults.flat()
      setPortfolios(enriched)
      setAllSnapshots(allSnaps)
      setLoading(false)
    }
    load()
  }, [])

  // Aggregate snapshots across all portfolios by date
  const aggregatedByDate: Record<string, number> = {}
  for (const snap of allSnapshots) {
    aggregatedByDate[snap.snapshot_date] =
      (aggregatedByDate[snap.snapshot_date] ?? 0) + Number(snap.total_value)
  }

  const filteredDates = Object.keys(aggregatedByDate)
    .filter((date) => {
      const days = TIMEFRAME_DAYS[timeframe]
      if (days === Infinity) return true
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      return new Date(date) >= cutoff
    })
    .sort()

  const chartData = filteredDates.map((date) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: aggregatedByDate[date],
  }))

  const totalValue = portfolios.reduce((s, p) => s + p.latestValue, 0)
  const totalCost = portfolios.reduce((s, p) => s + p.costBasis, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0
  const isPositive = totalGain >= 0

  const firstChartValue = chartData[0]?.value
  const lastChartValue = chartData[chartData.length - 1]?.value
  const periodChange = firstChartValue && lastChartValue ? lastChartValue - firstChartValue : null
  const periodChangePct = firstChartValue && periodChange != null ? (periodChange / firstChartValue) * 100 : null

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-32 bg-muted rounded-lg animate-pulse" />
          <div className="h-32 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your Pokémon sealed product portfolio</p>
      </div>

      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-xl text-center">
          <FolderOpen size={44} className="text-muted-foreground mb-4" />
          <p className="font-semibold text-lg">No portfolios yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            <Link href="/portfolios" className="underline underline-offset-2">Create a portfolio</Link>
            {" "}and add products via{" "}
            <Link href="/search" className="underline underline-offset-2">Search</Link>
          </p>
        </div>
      ) : (
        <>
          {/* Total value header */}
          <div className="space-y-1">
            <p className="text-4xl font-bold">{formatCurrency(totalValue)}</p>
            <div className={`flex items-center gap-1.5 text-sm font-medium ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span>
                {isPositive ? "+" : ""}{formatCurrency(totalGain)} ({formatPercent(totalGainPct)}) all time
              </span>
            </div>
            {periodChange != null && periodChangePct != null && (
              <p className="text-xs text-muted-foreground">
                {isPositive ? "+" : ""}{formatCurrency(periodChange)} ({formatPercent(periodChangePct)}) in {timeframe}
              </p>
            )}
          </div>

          {/* Chart */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="flex gap-1 mb-5">
              {(["7D", "1M", "3M", "6M", "MAX"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeframe === tf
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {chartData.length < 2 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                Run a sync to start building price history
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="dashGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} width={70} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value) => [formatCurrency(Number(value)), "Portfolio Value"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#dashGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Portfolio cards */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Portfolios</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {portfolios.map((p) => {
                const gain = p.latestValue - p.costBasis
                const gainPct = p.costBasis > 0 ? (gain / p.costBasis) * 100 : 0
                return (
                  <Link
                    key={p.id}
                    href={`/portfolios/${p.id}`}
                    className="border border-border rounded-lg p-4 bg-card hover:bg-accent/30 transition-colors"
                  >
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xl font-bold mt-2">{formatCurrency(p.latestValue)}</p>
                    <p className={`text-sm font-medium mt-0.5 ${gain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {gain >= 0 ? "+" : ""}{formatCurrency(gain)} ({formatPercent(gainPct)})
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
