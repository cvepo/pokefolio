"use client"

import { useEffect, useRef, useState } from "react"
import { Search, Plus, Package } from "lucide-react"
import { Portfolio } from "@/lib/supabase"
import { formatCurrency } from "@/lib/utils"

type SearchResult = {
  id: string
  name: string
  set: string
  set_name: string
  tcgplayerId: string
  variants: Array<{ id: string; condition: string; price: number }>
}

type AddModal = {
  product: SearchResult
  variant: SearchResult["variants"][0]
} | null

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [meta, setMeta] = useState<{ apiDailyRequestsRemaining?: number } | null>(null)
  const [addModal, setAddModal] = useState<AddModal>(null)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [portfolioId, setPortfolioId] = useState("")
  const [qty, setQty] = useState("1")
  const [buyPrice, setBuyPrice] = useState("")
  const [buyDate, setBuyDate] = useState("")
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/portfolios").then((r) => r.json()).then(setPortfolios)
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError("")
    setResults([])

    const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Search failed")
    } else {
      setResults(data.data ?? [])
      setMeta(data._metadata ?? null)
      if ((data.data ?? []).length === 0) setError("No sealed products found for that query.")
    }
    setLoading(false)
  }

  function openAddModal(product: SearchResult) {
    const sealedVariant = product.variants.find((v) => v.condition === "S" || v.condition === "Sealed")
    if (!sealedVariant) return
    setAddModal({ product, variant: sealedVariant })
    setBuyPrice(sealedVariant.price?.toFixed(2) ?? "")
    setBuyDate(new Date().toISOString().split("T")[0])
    setPortfolioId(portfolios[0]?.id ?? "")
    setQty("1")
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addModal || !portfolioId) return
    setAdding(true)

    await fetch(`/api/portfolios/${portfolioId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: addModal.product.id,
        quantity: parseInt(qty),
        purchase_price: parseFloat(buyPrice),
        purchase_date: buyDate || null,
      }),
    })

    setAddModal(null)
    setAdding(false)
  }

  const sealedResults = results.filter((r) =>
    r.variants.some((v) => v.condition === "S" || v.condition === "Sealed")
  )

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search for Pokémon sealed products to add to your portfolio
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search booster boxes, ETBs, tins..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {meta?.apiDailyRequestsRemaining != null && (
        <p className="text-xs text-muted-foreground">
          {meta.apiDailyRequestsRemaining} API requests remaining today
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sealedResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{sealedResults.length} sealed product(s) found</p>
          <div className="grid gap-3">
            {sealedResults.map((product) => {
              const sealedVariant = product.variants.find((v) => v.condition === "S" || v.condition === "Sealed")
              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between border border-border rounded-lg p-4 bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      {product.tcgplayerId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://product-images.tcgplayer.com/fit-in/64x64/${product.tcgplayerId}.jpg`}
                          alt={product.name}
                          className="w-10 h-10 rounded-md object-cover"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).style.display = "none"
                          }}
                        />
                      ) : (
                        <Package size={18} className="text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.set_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        {sealedVariant?.price ? formatCurrency(sealedVariant.price) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Sealed</p>
                    </div>
                    <button
                      onClick={() => openAddModal(product)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add to Portfolio Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div>
              <h2 className="font-bold text-base">Add to Portfolio</h2>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{addModal.product.name}</p>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Portfolio</label>
                <select
                  value={portfolioId}
                  onChange={(e) => setPortfolioId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Buy Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Purchase Date</label>
                <input
                  type="date"
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={adding || !portfolioId || !buyPrice}
                  className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {adding ? "Adding..." : "Add to Portfolio"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddModal(null)}
                  className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
