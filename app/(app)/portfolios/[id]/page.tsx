"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, PackageOpen, Trash2 } from "lucide-react"
import { Portfolio, PortfolioItem } from "@/lib/supabase"
import { cn, formatCurrency, formatPercent } from "@/lib/utils"

type SortKey =
  | "product"
  | "quantity"
  | "purchase_date"
  | "purchase_price"
  | "current"
  | "gain"
  | "notes"

type EditableField = "purchase_date" | "purchase_price" | "quantity" | "notes"

function itemGainParts(item: PortfolioItem) {
  const buyTotal = Number(item.purchase_price) * item.quantity
  const currentPrice = item.product?.current_price ?? Number(item.purchase_price)
  const currentTotal = currentPrice * item.quantity
  const gain = currentTotal - buyTotal
  const gainPct = buyTotal > 0 ? (gain / buyTotal) * 100 : 0
  return { buyTotal, currentPrice, currentTotal, gain, gainPct }
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

  const [editing, setEditing] = useState<{ itemId: string; field: EditableField } | null>(null)
  const [draft, setDraft] = useState("")
  const skipItemBlurRef = useRef(false)

  /** When true, Buy price & Current columns show line totals (× qty). Toggle from Qty header. */
  const [showLineTotals, setShowLineTotals] = useState(false)

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

  useEffect(() => {
    load()
  }, [id])

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
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortedItems = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1
    const rows = [...items]
    const nullPenalty = sortDir === "asc" ? 1 : -1

    rows.sort((ia, ib) => {
      switch (sortKey) {
        case "product": {
          const va = (ia.product?.name ?? ia.product_id).toLowerCase()
          const vb = (ib.product?.name ?? ib.product_id).toLowerCase()
          return va.localeCompare(vb) * mul
        }
        case "quantity":
          return (ia.quantity - ib.quantity) * mul
        case "purchase_price": {
          const ba = showLineTotals ? itemGainParts(ia).buyTotal : Number(ia.purchase_price)
          const bb = showLineTotals ? itemGainParts(ib).buyTotal : Number(ib.purchase_price)
          return (ba - bb) * mul
        }
        case "purchase_date": {
          const ta = ia.purchase_date ? new Date(ia.purchase_date).getTime() : null
          const tb = ib.purchase_date ? new Date(ib.purchase_date).getTime() : null
          if (ta == null && tb == null) return 0
          if (ta == null) return nullPenalty
          if (tb == null) return -nullPenalty
          return (ta - tb) * mul
        }
        case "current": {
          const ca = showLineTotals
            ? itemGainParts(ia).currentTotal
            : ia.product?.current_price ?? Number(ia.purchase_price)
          const cb = showLineTotals
            ? itemGainParts(ib).currentTotal
            : ib.product?.current_price ?? Number(ib.purchase_price)
          return (ca - cb) * mul
        }
        case "gain":
          return (itemGainParts(ia).gain - itemGainParts(ib).gain) * mul
        case "notes":
          return (ia.notes ?? "").toLowerCase().localeCompare((ib.notes ?? "").toLowerCase()) * mul
        default:
          return 0
      }
    })
    return rows
  }, [items, sortKey, sortDir, showLineTotals])

  async function handleDelete(itemId: string) {
    if (!confirm("Remove this item from the portfolio?")) return
    await fetch(`/api/portfolios/${id}/items/${itemId}`, { method: "DELETE" })
    load()
  }

  const cancelPortfolioRename = () => {
    skipPortfolioNameBlurRef.current = true
    if (portfolio) setNameDraft(portfolio.name)
    setRenamingPortfolio(false)
    requestAnimationFrame(() => {
      skipPortfolioNameBlurRef.current = false
    })
  }

  const commitPortfolioName = async () => {
    if (!portfolio || !id) return
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameDraft(portfolio.name)
      setRenamingPortfolio(false)
      return
    }
    if (trimmed === portfolio.name) {
      setRenamingPortfolio(false)
      return
    }
    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to rename")
      setPortfolio(data)
      setRenamingPortfolio(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rename portfolio")
      setNameDraft(portfolio.name)
      setRenamingPortfolio(false)
    }
  }

  const cancelItemEdit = useCallback(() => {
    skipItemBlurRef.current = true
    setEditing(null)
    setDraft("")
    requestAnimationFrame(() => {
      skipItemBlurRef.current = false
    })
  }, [])

  const startItemEdit = (item: PortfolioItem, field: EditableField) => {
    setEditing({ itemId: item.id, field })
    switch (field) {
      case "purchase_date":
        setDraft(item.purchase_date ? item.purchase_date.slice(0, 10) : "")
        break
      case "purchase_price":
        setDraft(String(Number(item.purchase_price)))
        break
      case "quantity":
        setDraft(String(item.quantity))
        break
      case "notes":
        setDraft(item.notes ?? "")
        break
    }
  }

  const commitItemEdit = async (itemId: string, field: EditableField, raw: string) => {
    if (skipItemBlurRef.current || !id) return
    const item = items.find((i) => i.id === itemId)
    if (!item) {
      cancelItemEdit()
      return
    }

    let patch: Partial<PortfolioItem & { purchase_price: number }> | null = null

    switch (field) {
      case "purchase_date": {
        const t = raw.trim()
        const nextVal = t === "" ? null : t
        if (nextVal && !/^\d{4}-\d{2}-\d{2}$/.test(nextVal)) {
          alert("Use purchase date format YYYY-MM-DD")
          return
        }
        const curr = item.purchase_date ? item.purchase_date.slice(0, 10) : ""
        if ((nextVal ?? "") === curr) {
          cancelItemEdit()
          return
        }
        patch = { purchase_date: nextVal }
        break
      }
      case "purchase_price": {
        const n = Number.parseFloat(raw.trim())
        if (!Number.isFinite(n) || n < 0) {
          alert("Enter a valid buy price.")
          return
        }
        if (n === Number(item.purchase_price)) {
          cancelItemEdit()
          return
        }
        patch = { purchase_price: n }
        break
      }
      case "quantity": {
        const q = Number.parseInt(raw.trim(), 10)
        if (!Number.isFinite(q) || q < 1) {
          alert("Quantity must be a whole number of at least 1.")
          return
        }
        if (q === item.quantity) {
          cancelItemEdit()
          return
        }
        patch = { quantity: q }
        break
      }
      case "notes": {
        const n = raw.trim() === "" ? null : raw.trim()
        if ((item.notes ?? null) === n) {
          cancelItemEdit()
          return
        }
        patch = { notes: n }
        break
      }
    }

    if (!patch) {
      cancelItemEdit()
      return
    }

    try {
      const res = await fetch(`/api/portfolios/${id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Update failed")
      setItems((prev) => prev.map((i) => (i.id === itemId ? data : i)))
      cancelItemEdit()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update item")
    }
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

  const headerBtn =
    "inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors select-none"

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
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
              onBlur={() => {
                if (skipPortfolioNameBlurRef.current) return
                void commitPortfolioName()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void commitPortfolioName()
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  cancelPortfolioRename()
                }
              }}
              className="text-2xl font-bold w-full max-w-xl px-2 py-1 rounded-md border border-input bg-background"
            />
          ) : (
            <h1
              className="text-2xl font-bold truncate cursor-default"
              title="Double-click to rename"
              onDoubleClick={() => {
                setNameDraft(portfolio.name)
                setRenamingPortfolio(true)
              }}
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
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("product")}>
                    Product
                    <SortIndicator active={sortKey === "product"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <div className="flex justify-end items-center gap-1">
                    <button
                      type="button"
                      title={showLineTotals ? "Showing line totals for buy & current — click for per-unit" : "Click to show buy & current as line totals (× qty)"}
                      onClick={() => setShowLineTotals((v) => !v)}
                      className={cn(
                        headerBtn,
                        "rounded-md px-2 py-1 -my-0.5 transition-shadow",
                        showLineTotals &&
                          "text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/50 bg-cyan-500/10 shadow-[0_0_16px_rgba(6,182,212,0.35)]"
                      )}
                    >
                      Qty
                      {showLineTotals ? <span className="text-[10px] font-normal opacity-80 ml-0.5">total</span> : null}
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                      aria-label="Sort by quantity"
                      onClick={() => toggleSort("quantity")}
                    >
                      <SortIndicator active={sortKey === "quantity"} dir={sortDir} />
                    </button>
                  </div>
                </th>
                <th className="text-left px-4 py-3">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("purchase_date")}>
                    Purchase date
                    <SortIndicator active={sortKey === "purchase_date"} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className={cn(headerBtn, showLineTotals && "text-cyan-700/90 dark:text-cyan-400/90")}
                      onClick={() => toggleSort("purchase_price")}
                    >
                      {showLineTotals ? "Buy total" : "Buy price"}
                      <SortIndicator active={sortKey === "purchase_price"} dir={sortDir} />
                    </button>
                  </div>
                </th>
                <th className="text-right px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className={cn(headerBtn, showLineTotals && "text-cyan-700/90 dark:text-cyan-400/90")}
                      onClick={() => toggleSort("current")}
                    >
                      {showLineTotals ? "Current total" : "Current"}
                      <SortIndicator active={sortKey === "current"} dir={sortDir} />
                    </button>
                  </div>
                </th>
                <th className="text-right px-4 py-3">
                  <div className="flex justify-end">
                    <button type="button" className={headerBtn} onClick={() => toggleSort("gain")}>
                      Gain / Loss
                      <SortIndicator active={sortKey === "gain"} dir={sortDir} />
                    </button>
                  </div>
                </th>
                <th className="text-left px-4 py-3 max-w-[200px]">
                  <button type="button" className={headerBtn} onClick={() => toggleSort("notes")}>
                    Notes
                    <SortIndicator active={sortKey === "notes"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedItems.map((item) => {
                const { buyTotal, currentPrice, currentTotal, gain, gainPct } = itemGainParts(item)
                const isEditingQty = editing?.itemId === item.id && editing.field === "quantity"
                const isEditingPrice = editing?.itemId === item.id && editing.field === "purchase_price"
                const isEditingDate = editing?.itemId === item.id && editing.field === "purchase_date"
                const isEditingNotes = editing?.itemId === item.id && editing.field === "notes"

                return (
                  <tr key={item.id} className="hover:bg-accent/20 transition-colors group">
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
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium group-hover/product:underline underline-offset-2 truncate">
                            {item.product?.name ?? item.product_id}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{item.product?.set_name}</p>
                        </div>
                      </Link>
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer"
                      onClick={() => !isEditingQty && startItemEdit(item, "quantity")}
                    >
                      {isEditingQty ? (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commitItemEdit(item.id, "quantity", draft)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault()
                              cancelItemEdit()
                            }
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                          }}
                          className="w-20 px-2 py-1 rounded border border-input bg-background text-right text-sm ml-auto block"
                          autoFocus
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                      onClick={() => !isEditingDate && startItemEdit(item, "purchase_date")}
                    >
                      {isEditingDate ? (
                        <input
                          type="date"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commitItemEdit(item.id, "purchase_date", draft)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault()
                              cancelItemEdit()
                            }
                          }}
                          className="px-2 py-1 rounded border border-input bg-background text-sm"
                          autoFocus
                        />
                      ) : item.purchase_date ? (
                        new Date(item.purchase_date).toLocaleDateString()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer"
                      onClick={() => !isEditingPrice && startItemEdit(item, "purchase_price")}
                    >
                      {isEditingPrice ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commitItemEdit(item.id, "purchase_price", draft)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault()
                              cancelItemEdit()
                            }
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                          }}
                          className="w-28 px-2 py-1 rounded border border-input bg-background text-right text-sm ml-auto block"
                          autoFocus
                        />
                      ) : showLineTotals ? (
                        formatCurrency(buyTotal)
                      ) : (
                        formatCurrency(Number(item.purchase_price))
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {currentPrice
                        ? formatCurrency(showLineTotals ? currentTotal : currentPrice)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={gain >= 0 ? "text-emerald-500" : "text-red-500"}>
                        {formatCurrency(gain)}
                        <br />
                        <span className="text-xs">{formatPercent(gainPct)}</span>
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 max-w-[200px] cursor-pointer align-top"
                      title={item.notes ?? undefined}
                      onClick={() => !isEditingNotes && startItemEdit(item, "notes")}
                    >
                      {isEditingNotes ? (
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commitItemEdit(item.id, "notes", draft)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault()
                              cancelItemEdit()
                            }
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                          }}
                          className="w-full min-w-[120px] px-2 py-1 rounded border border-input bg-background text-sm"
                          autoFocus
                        />
                      ) : (
                        <span className="line-clamp-2 break-words">{item.notes ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
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
