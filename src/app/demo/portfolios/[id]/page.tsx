"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, Package, PackageOpen } from "lucide-react"
import { centsToDollars } from "@/lib/dashboard/contract"
import type { Position } from "@/lib/dashboard/contract"
import { useDemoStore } from "@/lib/demo/use-demo-store"
import { cn, formatCurrency, formatPercent } from "@/lib/utils"

type SortKey = "product" | "quantity" | "avg_cost" | "market" | "current" | "unrealized" | "realized"

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="inline-block w-3.5 shrink-0 opacity-0" aria-hidden />
  return dir === "asc" ? (
    <ArrowUp size={14} className="shrink-0 opacity-70" aria-hidden />
  ) : (
    <ArrowDown size={14} className="shrink-0 opacity-70" aria-hidden />
  )
}

export default function DemoPortfolioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const store = useDemoStore()
  const portfolio = store.getPortfolios().find((p) => p.id === id) ?? null
  const envelope = store.getDashboard(id, "1M")
  const positions = envelope.data.positions.positions

  const [sortKey, setSortKey] = useState<SortKey>("current")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [sellProductId, setSellProductId] = useState<string | null>(null)
  const [sellQty, setSellQty] = useState("1")
  const [sellPrice, setSellPrice] = useState("")
  const [sellError, setSellError] = useState("")
  const [selling, setSelling] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1
    const rows = [...positions]
    rows.sort((a, b) => {
      switch (sortKey) {
        case "product":
          return a.name.localeCompare(b.name) * mul
        case "quantity":
          return (a.quantity - b.quantity) * mul
        case "avg_cost":
          return (a.avgUnitCost - b.avgUnitCost) * mul
        case "market":
          return ((a.currentUnitPrice ?? -1) - (b.currentUnitPrice ?? -1)) * mul
        case "current":
          return (a.marketValue - b.marketValue) * mul
        case "unrealized":
          return (a.unrealizedPnl - b.unrealizedPnl) * mul
        case "realized":
          return (a.realizedPnl - b.realizedPnl) * mul
        default:
          return 0
      }
    })
    return rows
  }, [positions, sortKey, sortDir])

  const summary = envelope.data.summary
  const totalCost = centsToDollars(summary.costBasis)
  const totalValue = centsToDollars(summary.totalValue)
  const totalUnrealized = centsToDollars(summary.unrealizedPnl)
  const totalRealized = centsToDollars(summary.realizedPnl)
  const totalUnrealizedPct =
    summary.unrealizedPnlPct != null ? summary.unrealizedPnlPct * 100 : null

  function openSell(position: Position) {
    setSellProductId(position.productId)
    setSellQty("1")
    setSellPrice(
      position.currentUnitPrice != null
        ? String(centsToDollars(position.currentUnitPrice))
        : ""
    )
    setSellError("")
  }

  function handleSell(e: React.FormEvent) {
    e.preventDefault()
    if (!sellProductId || !id) return
    const qty = Number(sellQty)
    const price = Number(sellPrice)
    if (!Number.isFinite(qty) || qty <= 0) {
      setSellError("Enter a positive quantity")
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setSellError("Enter a valid price")
      return
    }
    setSelling(true)
    const result = store.addTransaction({
      portfolioId: id,
      productId: sellProductId,
      type: "sell",
      quantity: qty,
      price,
      date: store.today,
    })
    setSelling(false)
    if (!result.ok) {
      setSellError(result.error)
      return
    }
    setSellProductId(null)
    setSellError("")
  }

  if (!portfolio) {
    return (
      <div className="p-8 space-y-3">
        <p>Portfolio not found.</p>
        <Link href="/demo/portfolios" className="text-sm underline underline-offset-2">
          Back to portfolios
        </Link>
      </div>
    )
  }

  const headerBtn =
    "inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors select-none"

  const sellingPosition = positions.find((p) => p.productId === sellProductId)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/demo/portfolios")}
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold truncate">{portfolio.name}</h1>
          {portfolio.description && (
            <p className="text-sm text-muted-foreground truncate">{portfolio.description}</p>
          )}
        </div>
        <Link
          href="/demo/search"
          className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          Add product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Value</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(totalValue)}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Cost Basis</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(totalCost)}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Unrealized P/L</p>
          <p
            className={cn(
              "text-xl font-bold mt-1 tabular-nums",
              totalUnrealized >= 0 ? "text-emerald-500" : "text-red-500"
            )}
          >
            {formatCurrency(totalUnrealized)}
          </p>
          <p
            className={cn(
              "text-xs",
              totalUnrealizedPct == null
                ? "text-muted-foreground"
                : totalUnrealizedPct >= 0
                  ? "text-emerald-500"
                  : "text-red-500"
            )}
          >
            {totalUnrealizedPct == null ? "—" : formatPercent(totalUnrealizedPct)}
          </p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Realized P/L</p>
          <p
            className={cn(
              "text-xl font-bold mt-1 tabular-nums",
              totalRealized >= 0 ? "text-emerald-500" : "text-red-500"
            )}
          >
            {formatCurrency(totalRealized)}
          </p>
        </div>
      </div>

      {sellProductId && sellingPosition && (
        <form
          onSubmit={handleSell}
          className="border border-border rounded-lg p-4 bg-card space-y-3 max-w-lg"
        >
          <h2 className="font-semibold text-sm">
            Sell {sellingPosition.name}
            <span className="text-muted-foreground font-normal">
              {" "}
              ({sellingPosition.quantity} held)
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Quantity</span>
              <input
                type="number"
                min={1}
                max={sellingPosition.quantity}
                value={sellQty}
                onChange={(e) => setSellQty(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Price per unit</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </label>
          </div>
          {sellError && <p className="text-sm text-destructive">{sellError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={selling}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {selling ? "Selling…" : "Confirm sell"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSellProductId(null)
                setSellError("")
              }}
              className="px-4 py-2 rounded-md border border-border text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-lg text-center">
          <PackageOpen size={36} className="text-muted-foreground mb-3" />
          <p className="font-medium">No items yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Go to{" "}
            <Link href="/demo/search" className="underline underline-offset-2">
              Search
            </Link>{" "}
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
                  <button type="button" className={headerBtn} onClick={() => toggleSort("market")}>
                    Market price
                    <SortIndicator active={sortKey === "market"} dir={sortDir} />
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
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((item) => {
                const avgCost = centsToDollars(item.avgUnitCost)
                const market =
                  item.currentUnitPrice != null ? centsToDollars(item.currentUnitPrice) : null
                const value = centsToDollars(item.marketValue)
                const unrealized = centsToDollars(item.unrealizedPnl)
                const unrealizedPct =
                  item.unrealizedPnlPct != null ? item.unrealizedPnlPct * 100 : null
                const realized = centsToDollars(item.realizedPnl)
                return (
                  <tr key={item.productId} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {item.tcgplayerId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://product-images.tcgplayer.com/fit-in/64x64/${item.tcgplayerId}.jpg`}
                              alt=""
                              className="w-10 h-10 object-cover"
                              onError={(e) => {
                                ;(e.currentTarget as HTMLImageElement).style.display = "none"
                              }}
                            />
                          ) : (
                            <Package size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.setName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(avgCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {market == null ? "—" : formatCurrency(market)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.priceStatus === "unknown" ? "—" : formatCurrency(value)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.priceStatus === "unknown" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={cn(
                            "tabular-nums",
                            unrealized >= 0 ? "text-emerald-500" : "text-red-500"
                          )}
                        >
                          {formatCurrency(unrealized)}
                          <br />
                          <span className="text-xs">
                            {unrealizedPct == null ? "—" : formatPercent(unrealizedPct)}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "tabular-nums",
                          realized >= 0 ? "text-emerald-500" : "text-red-500"
                        )}
                      >
                        {formatCurrency(realized)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openSell(item)}
                        className="text-xs font-medium underline underline-offset-2 text-muted-foreground hover:text-foreground"
                      >
                        Sell
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
