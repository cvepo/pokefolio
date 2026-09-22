"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Package, CheckCircle, ChevronDown } from "lucide-react"
import type { DemoProduct } from "@/lib/demo/contract"
import { useDemoStore } from "@/lib/demo/use-demo-store"
import { formatCurrency } from "@/lib/utils"

export default function DemoSearchPage() {
  const store = useDemoStore()
  const router = useRouter()
  const portfolios = store.getPortfolios()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DemoProduct[]>([])
  const [searched, setSearched] = useState(false)
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addProduct, setAddProduct] = useState<DemoProduct | null>(null)
  const [qty, setQty] = useState("1")
  const [buyPrice, setBuyPrice] = useState("")
  const [buyDate, setBuyDate] = useState(store.today)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const heldIds = new Set(
    store
      .getDashboard(portfolioId || undefined, "1M")
      .data.positions.positions.map((p) => p.productId)
  )

  useEffect(() => {
    if (!pickerOpen) return
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [pickerOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setResults(store.searchProducts(q, 40))
    setSearched(true)
    setError("")
  }

  function openAdd(product: DemoProduct) {
    setAddProduct(product)
    setQty("1")
    setBuyPrice(product.current_price != null ? String(product.current_price) : "")
    setBuyDate(store.today)
    setError("")
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addProduct || !portfolioId) return
    const quantity = Number(qty)
    const price = Number(buyPrice)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a positive quantity")
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price")
      return
    }
    setAdding(true)
    const result = store.addTransaction({
      portfolioId,
      productId: addProduct.id,
      type: "buy",
      quantity,
      price,
      date: buyDate || store.today,
    })
    setAdding(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/demo/portfolios/${portfolioId}`)
  }

  const activePortfolio = portfolios.find((p) => p.id === portfolioId)

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search size={22} /> Search
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Find a sample product and add a buy to a demo portfolio
          </p>
        </div>

        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm"
          >
            {activePortfolio?.name ?? "Select portfolio"}
            <ChevronDown size={14} />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 mt-1 z-10 w-56 rounded-md border border-border bg-card shadow-md py-1">
              {portfolios.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPortfolioId(p.id)
                    setPickerOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or set…"
          className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          Search
        </button>
      </form>

      {searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No products matched that query.</p>
      )}

      {addProduct && (
        <form onSubmit={handleAdd} className="border border-border rounded-lg p-4 bg-card space-y-3">
          <h2 className="font-semibold text-sm">Add {addProduct.name}</h2>
          <p className="text-xs text-muted-foreground">{addProduct.set_name}</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Qty</span>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Buy price</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Date</span>
              <input
                type="date"
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={adding || !portfolioId}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add buy"}
            </button>
            <button
              type="button"
              onClick={() => setAddProduct(null)}
              className="px-4 py-2 rounded-md border border-border text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {results.map((product) => {
          const held = heldIds.has(product.id)
          return (
            <li
              key={product.id}
              className="flex items-center gap-3 border border-border rounded-lg p-3 bg-card"
            >
              <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {product.tcgplayer_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://product-images.tcgplayer.com/fit-in/64x64/${product.tcgplayer_id}.jpg`}
                    alt=""
                    className="w-12 h-12 object-cover"
                  />
                ) : (
                  <Package size={18} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground truncate">{product.set_name}</p>
                <p className="text-xs tabular-nums mt-0.5">
                  {product.current_price == null
                    ? "Price unknown"
                    : formatCurrency(product.current_price)}
                </p>
              </div>
              {held && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={12} /> In portfolio
                </span>
              )}
              <button
                type="button"
                onClick={() => openAdd(product)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent"
              >
                <Plus size={12} /> Add
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
