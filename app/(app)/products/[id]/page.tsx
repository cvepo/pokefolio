"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Package, TrendingUp, TrendingDown } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Product, PriceSnapshot } from "@/lib/supabase"
import { formatCurrency } from "@/lib/utils"

type Timeframe = "7D" | "1M" | "3M" | "6M" | "MAX"

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "MAX": Infinity,
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then(({ product, snapshots }) => {
        setProduct(product)
        setSnapshots(snapshots ?? [])
        setLoading(false)
      })
  }, [id])

  const filteredSnapshots = snapshots.filter((s) => {
    const days = TIMEFRAME_DAYS[timeframe]
    if (days === Infinity) return true
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return new Date(s.snapshot_date) >= cutoff
  })

  const chartData = filteredSnapshots.map((s) => ({
    date: new Date(s.snapshot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: Number(s.price),
  }))

  const firstPrice = chartData[0]?.price
  const lastPrice = chartData[chartData.length - 1]?.price ?? product?.current_price
  const priceChange = firstPrice && lastPrice ? lastPrice - firstPrice : null
  const priceChangePct = firstPrice && priceChange != null ? (priceChange / firstPrice) * 100 : null
  const isPositive = (priceChange ?? 0) >= 0

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!product) return <div className="p-8">Product not found.</div>

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
            {product.tcgplayer_id ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://product-images.tcgplayer.com/fit-in/64x64/${product.tcgplayer_id}.jpg`}
                alt={product.name}
                className="w-10 h-10 rounded-md object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
              />
            ) : (
              <Package size={18} className="text-muted-foreground" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">{product.name}</h1>
            <p className="text-sm text-muted-foreground">{product.set_name} · Sealed</p>
          </div>
        </div>
      </div>

      {/* Price header */}
      <div className="space-y-1">
        <p className="text-3xl font-bold">
          {product.current_price ? formatCurrency(product.current_price) : "—"}
        </p>
        {priceChange != null && priceChangePct != null && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>{isPositive ? "+" : ""}{formatCurrency(priceChange)} ({isPositive ? "+" : ""}{priceChangePct.toFixed(2)}%)</span>
            <span className="text-muted-foreground font-normal">vs {timeframe} ago</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="flex gap-1 mb-4">
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
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Not enough price history yet. Check back after the daily sync runs.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={55} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value) => [formatCurrency(Number(value)), "Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? "#10b981" : "#ef4444"}
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Info */}
      <div className="border border-border rounded-lg p-4 bg-card grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Set</p>
          <p className="font-medium">{product.set_name}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last Updated</p>
          <p className="font-medium">
            {product.last_synced_at
              ? new Date(product.last_synced_at).toLocaleDateString()
              : "Never synced"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Data Points</p>
          <p className="font-medium">{snapshots.length} days</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Condition</p>
          <p className="font-medium">Sealed</p>
        </div>
      </div>
    </div>
  )
}
