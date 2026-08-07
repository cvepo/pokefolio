"use client"

import { Package } from "lucide-react"
import { formatPercent } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { StalenessChip } from "@/components/compare/freshness-banner"

export type SelectorRow = {
  product_id: string
  name: string
  set_name: string
  tcgplayer_id: string | null
  windowPct: number | null
  staleDays: number | null
  color?: string
}

type ProductSelectorProps = {
  rows: SelectorRow[]
  selectedIds: Set<string>
  search: string
  onSearchChange: (v: string) => void
  onToggle: (id: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  onSelectTopMovers: () => void
  onHover: (id: string | null) => void
  hoveredId: string | null
  /** Combined mode: hover does not isolate chart lines. */
  isolationDisabled?: boolean
}

export function ProductSelector({
  rows,
  selectedIds,
  search,
  onSearchChange,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectTopMovers,
  onHover,
  hoveredId,
  isolationDisabled,
}: ProductSelectorProps) {
  const q = search.trim().toLowerCase()
  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.set_name.toLowerCase().includes(q)
      )
    : rows

  // Already sorted by Δ% desc by parent; keep order.
  const selectedCount = selectedIds.size

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Products
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter by name or set"
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background"
        />
        <div className="flex gap-1 flex-wrap">
          <BulkBtn onClick={onSelectAll}>All</BulkBtn>
          <BulkBtn onClick={onSelectNone}>None</BulkBtn>
          <BulkBtn onClick={onSelectTopMovers}>Top movers</BulkBtn>
        </div>
        {selectedCount > 10 && (
          <p className="text-[11px] text-muted-foreground">
            {selectedCount} selected — hover a row to isolate
          </p>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto px-1 pb-3 space-y-0.5 min-h-0">
        {filtered.map((r) => {
          const selected = selectedIds.has(r.product_id)
          const positive = r.windowPct != null && r.windowPct >= 0
          return (
            <li key={r.product_id}>
              <label
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
                  selected ? "bg-accent/40" : "hover:bg-accent/30",
                  hoveredId === r.product_id && "ring-1 ring-border"
                )}
                onMouseEnter={() => {
                  if (!isolationDisabled) onHover(r.product_id)
                }}
                onMouseLeave={() => {
                  if (!isolationDisabled) onHover(null)
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(r.product_id)}
                  className="shrink-0"
                />
                <div
                  className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden"
                  style={
                    selected && r.color
                      ? { boxShadow: `inset 0 0 0 2px ${r.color}` }
                      : undefined
                  }
                >
                  {r.tcgplayer_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://product-images.tcgplayer.com/fit-in/64x64/${r.tcgplayer_id}.jpg`}
                      alt=""
                      className="w-7 h-7 object-cover"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = "none"
                      }}
                    />
                  ) : (
                    <Package size={12} className="text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium leading-tight">{r.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {r.windowPct != null ? (
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          positive ? "text-emerald-500" : "text-red-500"
                        )}
                      >
                        {formatPercent(r.windowPct)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                    <StalenessChip staleDays={r.staleDays} />
                  </div>
                </div>
              </label>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-xs text-muted-foreground text-center">
            No products match
          </li>
        )}
      </ul>
    </div>
  )
}

function BulkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-0.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border"
    >
      {children}
    </button>
  )
}
