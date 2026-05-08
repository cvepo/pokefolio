"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Trash2, PackageOpen } from "lucide-react"
import { Portfolio, PortfolioItem } from "@/lib/supabase"
import { formatCurrency, formatPercent } from "@/lib/utils"

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [pRes, iRes] = await Promise.all([
      fetch(`/api/portfolios/${id}`),
      fetch(`/api/portfolios/${id}/items`),
    ])
    const [pData, iData] = await Promise.all([pRes.json(), iRes.json()])
    setPortfolio(pData)
    setItems(Array.isArray(iData) ? iData : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleDelete(itemId: string) {
    if (!confirm("Remove this item from the portfolio?")) return
    await fetch(`/api/portfolios/${id}/items/${itemId}`, { method: "DELETE" })
    load()
  }

  const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price) * i.quantity, 0)
  const totalValue = items.reduce(
    (sum, i) => sum + (i.product?.current_price ?? Number(i.purchase_price)) * i.quantity,
    0
  )
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!portfolio) return <div className="p-8">Portfolio not found.</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/portfolios")} className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">{portfolio.name}</h1>
          {portfolio.description && <p className="text-sm text-muted-foreground">{portfolio.description}</p>}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Value</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalValue)}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Cost</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalCost)}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Gain / Loss</p>
          <p className={`text-2xl font-bold mt-1 ${totalGain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatCurrency(totalGain)}
          </p>
          <p className={`text-sm ${totalGain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatPercent(totalGainPct)}
          </p>
        </div>
      </div>

      {/* Items table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-lg text-center">
          <PackageOpen size={36} className="text-muted-foreground mb-3" />
          <p className="font-medium">No items yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Go to{" "}
            <Link href="/search" className="underline underline-offset-2">
              Search
            </Link>{" "}
            to add sealed products
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Buy Price</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Current</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Gain/Loss</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const buyTotal = Number(item.purchase_price) * item.quantity
                const currentPrice = item.product?.current_price ?? Number(item.purchase_price)
                const currentTotal = currentPrice * item.quantity
                const gain = currentTotal - buyTotal
                const gainPct = buyTotal > 0 ? (gain / buyTotal) * 100 : 0
                return (
                  <tr key={item.id} className="hover:bg-accent/20 transition-colors group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${encodeURIComponent(item.product_id)}`}
                        className="font-medium hover:underline underline-offset-2"
                      >
                        {item.product?.name ?? item.product_id}
                      </Link>
                      <p className="text-xs text-muted-foreground">{item.product?.set_name}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(item.purchase_price))}</td>
                    <td className="px-4 py-3 text-right">{currentPrice ? formatCurrency(currentPrice) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={gain >= 0 ? "text-emerald-500" : "text-red-500"}>
                        {formatCurrency(gain)}
                        <br />
                        <span className="text-xs">{formatPercent(gainPct)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
