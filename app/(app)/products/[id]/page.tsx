"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Package, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Portfolio, Product, PriceSnapshot, Transaction } from "@/lib/supabase"
import { formatCurrency, formatPercent } from "@/lib/utils"
import { useActivePortfolio } from "@/lib/use-active-portfolio"
import { computeHoldings } from "@/lib/holdings"

type Timeframe = "7D" | "1M" | "3M" | "6M" | "MAX"

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "7D": 7, "1M": 30, "3M": 90, "6M": 180, "MAX": Infinity,
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")

  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const { activePortfolio, activePortfolioId } = useActivePortfolio(portfolios)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [txType, setTxType] = useState<"buy" | "sell">("buy")
  const [txQty, setTxQty] = useState("1")
  const [txPrice, setTxPrice] = useState("")
  const [txDate, setTxDate] = useState(new Date().toISOString().split("T")[0])
  const [txNotes, setTxNotes] = useState("")
  const [adding, setAdding] = useState(false)
  const [txError, setTxError] = useState("")

  useEffect(() => {
    fetch(`/api/products/${id}`).then((r) => r.json()).then(({ product, snapshots }) => {
      setProduct(product); setSnapshots(snapshots ?? []); setLoading(false)
    })
    fetch("/api/portfolios").then((r) => r.json()).then((data) => setPortfolios(Array.isArray(data) ? data : []))
  }, [id])

  // Load transactions for active portfolio + this product
  useEffect(() => {
    if (!activePortfolioId || !id) { setTransactions([]); return }
    fetch(`/api/portfolios/${activePortfolioId}/transactions?productId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
  }, [activePortfolioId, id])

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

  const holdings = computeHoldings(transactions)

  async function handleAddTx(e: React.FormEvent) {
    e.preventDefault()
    if (!activePortfolioId || !id) return
    setTxError("")
    setAdding(true)
    const res = await fetch(`/api/portfolios/${activePortfolioId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: id,
        type: txType,
        quantity: parseInt(txQty, 10),
        price: parseFloat(txPrice),
        transaction_date: txDate,
        notes: txNotes.trim() || null,
      }),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) {
      setTxError(data?.error ?? "Failed to record transaction")
      return
    }
    setTransactions((prev) => [...prev, data])
    setShowAdd(false)
    setTxQty("1"); setTxPrice(""); setTxDate(new Date().toISOString().split("T")[0]); setTxNotes("")
  }

  async function handleDeleteTx(txId: string) {
    if (!confirm("Delete this transaction?")) return
    const res = await fetch(`/api/transactions/${txId}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data?.error ?? "Failed to delete"); return }
    setTransactions((prev) => prev.filter((t) => t.id !== txId))
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!product) return <div className="p-8">Product not found.</div>

  const currentPrice = product.current_price ? Number(product.current_price) : null
  const positionValue = currentPrice ? holdings.netQty * currentPrice : null
  const unrealized = positionValue != null ? positionValue - holdings.costBasisRemaining : null
  const unrealizedPct =
    unrealized != null && holdings.costBasisRemaining > 0
      ? (unrealized / holdings.costBasisRemaining) * 100
      : null

  const sortedTxs = [...transactions].sort((a, b) => {
    const d = b.transaction_date.localeCompare(a.transaction_date)
    if (d !== 0) return d
    return (b.created_at ?? "").localeCompare(a.created_at ?? "")
  })

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
                timeframe === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >{tf}</button>
          ))}
        </div>

        {chartData.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Not enough price history yet.
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
              <Area type="monotone" dataKey="price" stroke={isPositive ? "#10b981" : "#ef4444"} strokeWidth={2} fill="url(#priceGradient)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Inventory log */}
      <div className="border border-border rounded-lg bg-card">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Inventory log</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activePortfolio
                ? <>Transactions in <span className="font-medium text-foreground">{activePortfolio.name}</span></>
                : "Pick a portfolio to see and add transactions"}
            </p>
          </div>
          {activePortfolio && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={14} />
              New transaction
            </button>
          )}
        </div>

        {/* Holdings summary */}
        {activePortfolio && holdings.netQty > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-border bg-muted/30">
            <Stat label="Holdings" value={String(holdings.netQty)} />
            <Stat label="Avg cost" value={formatCurrency(holdings.avgCostRemaining)} />
            <Stat
              label="Unrealized"
              value={unrealized != null ? formatCurrency(unrealized) : "—"}
              sub={unrealizedPct != null ? formatPercent(unrealizedPct) : undefined}
              tone={unrealized != null ? (unrealized >= 0 ? "pos" : "neg") : undefined}
            />
            <Stat
              label="Realized"
              value={formatCurrency(holdings.realizedPnL)}
              tone={holdings.realizedPnL >= 0 ? "pos" : "neg"}
            />
          </div>
        )}

        {/* Add transaction form */}
        {showAdd && activePortfolio && (
          <form onSubmit={handleAddTx} className="p-4 border-b border-border space-y-3 bg-background/50">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTxType("buy")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  txType === "buy" ? "bg-emerald-500 text-white" : "border border-border hover:bg-accent"
                }`}
              >Buy</button>
              <button
                type="button"
                onClick={() => setTxType("sell")}
                disabled={holdings.netQty === 0}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  txType === "sell" ? "bg-red-500 text-white" : "border border-border hover:bg-accent"
                }`}
              >Sell</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Quantity</label>
                <input
                  type="number" min="1" value={txQty} onChange={(e) => setTxQty(e.target.value)}
                  max={txType === "sell" ? holdings.netQty : undefined}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Price ($)</label>
                <input
                  type="number" step="0.01" min="0" value={txPrice} onChange={(e) => setTxPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Date</label>
                <input
                  type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (optional)</label>
              <input
                type="text" value={txNotes} onChange={(e) => setTxNotes(e.target.value)}
                placeholder="e.g. bought from local game store"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            {txError && <p className="text-sm text-destructive">{txError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit" disabled={adding || !txPrice || !txQty}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {adding ? "Saving..." : `Record ${txType}`}
              </button>
              <button
                type="button" onClick={() => { setShowAdd(false); setTxError("") }}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent"
              >Cancel</button>
            </div>
          </form>
        )}

        {/* Transactions table */}
        {sortedTxs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {activePortfolio ? "No transactions yet for this portfolio." : "Select a portfolio above to view transactions."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Qty</th>
                  <th className="text-right px-4 py-2 font-medium">Price</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                  <th className="text-left px-4 py-2 font-medium">Notes</th>
                  <th className="px-4 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-accent/20 transition-colors group">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                        tx.type === "buy"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-red-500/15 text-red-500"
                      }`}>
                        {tx.type === "buy" ? "BUY" : "SELL"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(tx.transaction_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">{tx.quantity}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(tx.price))}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(Number(tx.price) * tx.quantity)}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <span className="text-xs text-muted-foreground line-clamp-2">{tx.notes ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeleteTx(tx.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : ""
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className={`text-xs ${color}`}>{sub}</p>}
    </div>
  )
}
