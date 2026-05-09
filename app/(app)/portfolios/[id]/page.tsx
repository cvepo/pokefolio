"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, PackageOpen, Trash2, Package } from "lucide-react"
import { Portfolio, PortfolioItem } from "@/lib/supabase"
import { cn, formatCurrency, formatPercent } from "@/lib/utils"

type SortKey =
  | "product"
  | "quantity"
  | "avg_cost"
  | "current"
  | "unrealized"
  | "realized"

function itemMetrics(item: PortfolioItem) {
  const avgCost = Number(item.purchase_price)
  const qty = item.quantity
  const costBasis = avgCost * qty
  const currentPrice = item.product?.current_price ?? avgCost
  const currentValue = currentPrice * qty
  const unrealized = currentValue - costBasis
  const unrealizedPct = costBasis > 0 ? (unrealized / costBasis) * 100 : 0
  const realized = Number(item.realized_pnl ?? 0)
  return { avgCost, qty, costBasis, currentPrice, currentValue, unrealized, unrealizedPct, realized }
}

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="inline-block w-3.5 shrink-0 opacity-0" aria-hidden />
  return dir === "asc" ? (
    <ArrowUp size={14} className="shrink-0 opacity-70" aria-hidden />
  ) : (
    <ArrowDown size={14} className="shrink-0 opacity-70" aria-hidden />
  )
}

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [loading, setLoading] = useState(true)

  const [sortKey, setSortKey] = useState<SortKey>("product")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const [renamingPortfolio, setRenamingPortfolio] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const skipPortfolioNameBlurRef = useRef(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const [pRes, iRes] = await Promise.all([
      fetch(`/api/portfolios/${id}`),
      fetch(`/api/portfolios/${id}/items`),
    ])
    const [pData, iData] = await Promise.all([pRes.json(), iRes.json()])
    setPortfolio(pData?.error ? null : pData)
    setItems(Array.isArray(iData) ? iData : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (portfolio && !renamingPortfolio) setNameDraft(portfolio.name)
  }, [portfolio, renamingPortfolio])

  useEffect(() => {
    if (!renamingPortfolio) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renamingPortfolio])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const sortedItems = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1
    const rows = [...items]
    rows.sort((ia, ib) => {
      const ma = itemMetrics(ia), mb = itemMetrics(ib)
      switch (sortKey) {
        case "product": {
          const va = (ia.product?.name ?? ia.product_id).toLowerCase()
          const vb = (ib.product?.name ?? ib.product_id).toLowerCase()
          return va.localeCompare(vb) * mul
        }
        case "quantity": return (ma.qty - mb.qty) * mul
        case "avg_cost": return (ma.avgCost - mb.avgCost) * mul
        case "current": return (ma.currentValue - mb.currentValue) * mul
        case "unrealized": return (ma.unrealized - mb.unrealized) * mul
        case "realized": return (ma.realized - mb.realized) * mul
        default: return 0
      }
    })
    return rows
  }, [items, sortKey, sortDir])

  async function handleDelete(productId: string, name: string) {
    if (!confirm(`Delete all transactions for "${name}"? This cannot be undone.`)) return
    await fetch(`/api/portfolios/${id}/products/${encodeURIComponent(productId)}`, { method: "DELETE" })
    setItems((prev) => prev.filter((p) => p.product_id !== productId))
  }

  const cancelPortfolioRename = () => {
    skipPortfolioNameBlurRef.current = true
    if (portfolio) setNameDraft(portfolio.name)
    setRenamingPortfolio(false)
    requestAnimationFrame(() => { skipPortfolioNameBlurRef.current = false })
  }

  const commitPortfolioName = async () => {
    if (!portfolio || !id) return
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameDraft(portfolio.name); setRenamingPortfolio(false); return
    }
    if (trimmed === portfolio.name) { setRenamingPortfolio(false); return }
    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to rename")
      setPortfolio(data); setRenamingPortfolio(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rename portfolio")
      setNameDraft(portfolio.name); setRenamingPortfolio(false)
    }
  }

  const totalCost = items.reduce((s, i) => s + itemMetrics(i).costBasis, 0)
  const totalValue = items.reduce((s, i) => s + itemMetrics(i).currentValue, 0)
  const totalRealized = items.reduce((s, i) => s + itemMetrics(i).realized, 0)
  const totalUnrealized = totalValue - totalCost
  const totalUnrealizedPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : 0

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!portfolio) return <div className="p-8">Portfolio not found.</div>

  const headerBtn =
    "inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors select-none"

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/portfolios")}
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          {renamingPortfolio ? (
            <input
              ref={renameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { if (skipPortfolioNameBlurRef.current) return; void commitPortfolioName() }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commitPortfolioName() }
                if (e.key === "Escape") { e.preventDefault(); cancelPortfolioRename() }
              }}
              className="text-2xl font-bold w-full max-w-xl px-2 py-1 rounded-md border border-input bg-background"
            />
          ) : (
            <h1
              className="text-2xl font-bold truncate cursor-default"
              title="Double-click to rename"
              onDoubleClick={() => { setNameDraft(portfolio.name); setRenamingPortfolio(true) }}
            >
              {portfolio.name}
            </h1>
          )}
          {portfolio.description && (
            <p className="text-sm text-muted-foreground truncate">{portfolio.description}</p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Value</p>
          <p className="text-xl font-bold mt-1">{formatCurrency(totalValue)}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Cost Basis</p>
          <p className="text-xl font-bold mt-1">{formatCurrency(totalCost)}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Unrealized P/L</p>
          <p className={`text-xl font-bold mt-1 ${totalUnrealized >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatCurrency(totalUnrealized)}
          </p>
          <p className={`text-xs ${totalUnrealized >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatPercent(totalUnrealizedPct)}
          </p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Realized P/L</p>
          <p className={`text-xl font-bold mt-1 ${totalRealized >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatCurrency(totalRealized)}
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
            <Link href="/search" className="underline underline-offset-2">Search</Link>{" "}
            to add sealed products
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("product")}>
                    Product
                    <SortIndicator active={sortKey === "product"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("quantity")}>
                    Qty
                    <SortIndicator active={sortKey === "quantity"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("avg_cost")}>
                    Avg cost
                    <SortIndicator active={sortKey === "avg_cost"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("current")}>
                    Value
                    <SortIndicator active={sortKey === "current"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("unrealized")}>
                    Unrealized
                    <SortIndicator active={sortKey === "unrealized"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("realized")}>
                    Realized
                    <SortIndicator active={sortKey === "realized"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedItems.map((item) => {
                const m = itemMetrics(item)
                return (
                  <tr key={item.product_id} className="hover:bg-accent/20 transition-colors group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${encodeURIComponent(item.product_id)}`}
                        className="flex items-center gap-3 group/product"
                      >
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {item.product?.tcgplayer_id ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://product-images.tcgplayer.com/fit-in/64x64/${item.product.tcgplayer_id}.jpg`}
                              alt={item.product.name}
                              className="w-10 h-10 object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                            />
                          ) : (
                            <Package size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium group-hover/product:underline underline-offset-2 truncate">
                            {item.product?.name ?? item.product_id}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{item.product?.set_name}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{m.qty}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(m.avgCost)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(m.currentValue)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(m.unrealized >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {formatCurrency(m.unrealized)}
                        <br />
                        <span className="text-xs">{formatPercent(m.unrealizedPct)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(m.realized >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {formatCurrency(m.realized)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.product_id, item.product?.name ?? item.product_id)}
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
