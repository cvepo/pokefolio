"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { TrendingUp, TrendingDown, FolderOpen, Package } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Portfolio, PortfolioSnapshot } from "@/lib/supabase"
import { formatCurrency, formatPercent, formatSpan } from "@/lib/utils"

type Mover = {
  product_id: string
  name: string
  set_name: string
  tcgplayer_id: string | null
  current_price: number
  start_price: number
  change_per_unit: number
  change_pct: number
  qty_held: number
}

type Timeframe = "7D" | "1M" | "3M" | "6M" | "MAX"
type ChartMode = "actual" | "projected"

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
  const [chartMode, setChartMode] = useState<ChartMode>("actual")
  const [loading, setLoading] = useState(true)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [movers, setMovers] = useState<{ winners: Mover[]; losers: Mover[] }>({ winners: [], losers: [] })
  const [moversLoading, setMoversLoading] = useState(false)

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
            // Initial load uses chartMode (which starts as "actual"); the dedicated
            // toggle effect below re-fetches when the user flips the mode.
            fetch(`/api/dashboard/snapshots?portfolioId=${p.id}&mode=${chartMode}`).then((r) => r.json())
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch movers whenever the timeframe changes (or on mount).
  useEffect(() => {
    setMoversLoading(true)
    fetch(`/api/dashboard/movers?timeframe=${timeframe}`)
      .then((r) => r.json())
      .then((data) => {
        setMovers({ winners: data?.winners ?? [], losers: data?.losers ?? [] })
        setMoversLoading(false)
      })
      .catch(() => setMoversLoading(false))
  }, [timeframe])

  // Refetch snapshots when chartMode toggles (skip initial mount — handled by load()).
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (portfolios.length === 0) return
    setSnapshotsLoading(true)
    Promise.all(
      portfolios.map((p) =>
        fetch(`/api/dashboard/snapshots?portfolioId=${p.id}&mode=${chartMode}`).then((r) => r.json())
      )
    ).then((results) => {
      setAllSnapshots(results.flat())
      setSnapshotsLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartMode])

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

  const firstChartValue = chartData[0]?.value
  const lastChartValue = chartData[chartData.length - 1]?.value
  const hasPeriodMetric =
    chartData.length >= 2 &&
    firstChartValue != null &&
    lastChartValue != null &&
    typeof firstChartValue === "number" &&
    typeof lastChartValue === "number"
  const periodChange = hasPeriodMetric ? lastChartValue - firstChartValue : null
  const periodChangePct =
    periodChange != null && firstChartValue > 0
      ? (periodChange / firstChartValue) * 100
      : null
  const isPositivePeriod = periodChange != null && periodChange >= 0

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
            {hasPeriodMetric && periodChange != null ? (
              <>
                <div
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    isPositivePeriod ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {isPositivePeriod ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  <span>
                    {isPositivePeriod ? "+" : ""}
                    {formatCurrency(periodChange)}
                    {periodChangePct != null ? (
                      <> ({formatPercent(periodChangePct)})</>
                    ) : (
                      <> (—%)</>
                    )}{" "}
                    · {timeframe === "MAX" && filteredDates.length >= 2
                      ? `MAX (${formatSpan(filteredDates[0], filteredDates[filteredDates.length - 1])})`
                      : timeframe}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Based on synced portfolio history in this range.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">—</span> change for {timeframe} (need more history — run sync)
              </p>
            )}
          </div>

          {/* Chart */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex gap-1">
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
              <div
                className="flex gap-1 p-0.5 rounded-md border border-border bg-background/50"
                title={
                  chartMode === "projected"
                    ? "Showing current holdings as if always held — pure market movement"
                    : "Showing actual portfolio value (changes with buys and sells)"
                }
              >
                {(["actual", "projected"] as ChartMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    disabled={snapshotsLoading}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize disabled:opacity-50 ${
                      chartMode === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {chartMode === "projected" && (
              <p className="text-xs text-muted-foreground mb-3 -mt-2">
                Projected: applies current holdings to historical prices (no buy/sell impact).
              </p>
            )}

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

          {/* Biggest movers (responds to the chart timeframe selector above) */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Biggest movers
              </h2>
              <span className="text-xs text-muted-foreground">over {timeframe}</span>
            </div>

            {moversLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : movers.winners.length === 0 && movers.losers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Not enough price history yet to compute movers.
              </p>
            ) : (
              <div className="space-y-3">
                {movers.winners.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-emerald-500 uppercase tracking-wide flex items-center gap-1.5">
                      <TrendingUp size={12} /> Winners
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {movers.winners.map((m) => (
                        <MoverCard key={m.product_id} mover={m} />
                      ))}
                    </div>
                  </>
                )}
                {movers.losers.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-red-500 uppercase tracking-wide flex items-center gap-1.5 mt-4">
                      <TrendingDown size={12} /> Losers
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {movers.losers.map((m) => (
                        <MoverCard key={m.product_id} mover={m} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MoverCard({ mover }: { mover: Mover }) {
  const positive = mover.change_pct >= 0
  return (
    <Link
      href={`/products/${encodeURIComponent(mover.product_id)}`}
      className={`flex flex-col gap-1.5 border rounded-lg p-3 bg-card hover:bg-accent/30 transition-colors ${
        positive ? "border-emerald-500/30" : "border-red-500/30"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {mover.tcgplayer_id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://product-images.tcgplayer.com/fit-in/64x64/${mover.tcgplayer_id}.jpg`}
              alt={mover.name}
              className="w-9 h-9 object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
            />
          ) : (
            <Package size={14} className="text-muted-foreground" />
          )}
        </div>
        <p className="text-xs font-medium truncate flex-1">{mover.name}</p>
      </div>
      <p className="text-sm font-bold mt-0.5">{formatCurrency(mover.current_price)}</p>
      <div className={`flex items-baseline gap-1 text-xs font-semibold ${positive ? "text-emerald-500" : "text-red-500"}`}>
        <span>{formatPercent(mover.change_pct)}</span>
        <span className="opacity-70 font-normal">
          ({positive ? "+" : ""}{formatCurrency(mover.change_per_unit)}/unit)
        </span>
      </div>
    </Link>
  )
}
