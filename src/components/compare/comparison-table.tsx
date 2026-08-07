"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronDown, Package } from "lucide-react"
import {
  cn,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSnapshotDate,
} from "@/lib/utils"
import { StalenessChip } from "@/components/compare/freshness-banner"
import type { CompareTableRow, ExitReviewSignal } from "@/lib/compare-series"

type SortKey =
  | "name"
  | "current"
  | "windowPct"
  | "momentum7d"
  | "drawdown"
  | "positionDelta"
  | "unrealized"
  | "signal"
  | "qty"
  | "avgCost"
  | "set"
  | "perUnitDelta"
  | "anchorDate"
  | "lastSnapshot"

type ComparisonTableProps = {
  rows: CompareTableRow[]
  colors: Record<string, string>
  hoveredId: string | null
  onHover: (id: string | null) => void
  /** Combined mode: row click toggles basket membership. */
  onRowClick?: (id: string) => void
  isolationDisabled?: boolean
}

const DEFAULT_COLS = new Set([
  "name",
  "current",
  "windowPct",
  "momentum7d",
  "drawdown",
  "positionDelta",
  "unrealized",
  "signal",
])

const EXTRA_COLS: Array<{ key: SortKey; label: string }> = [
  { key: "qty", label: "Qty" },
  { key: "avgCost", label: "Avg cost" },
  { key: "set", label: "Set" },
  { key: "perUnitDelta", label: "Δ$/unit" },
  { key: "anchorDate", label: "Anchor date" },
  { key: "lastSnapshot", label: "Last snapshot" },
]

const SIGNAL_ORDER: Record<ExitReviewSignal, number> = {
  Accelerating: 0,
  Cooling: 1,
  Recovering: 2,
  Declining: 3,
  "Insufficient data": 4,
}

export function ComparisonTable({
  rows,
  colors,
  hoveredId,
  onHover,
  onRowClick,
  isolationDisabled,
}: ComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("windowPct")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [extra, setExtra] = useState<Set<SortKey>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "name" || key === "set" || key === "signal" ? "asc" : "desc")
    }
  }

  const toggleExtra = (key: SortKey) => {
    setExtra((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const cmp = (va: number | null | string, vb: number | null | string) => {
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb) * mul
        }
        return ((va as number) - (vb as number)) * mul
      }
      switch (sortKey) {
        case "name":
          return cmp(a.name, b.name)
        case "current":
          return cmp(a.current_price, b.current_price)
        case "windowPct":
          return cmp(a.windowPct, b.windowPct)
        case "momentum7d":
          return cmp(a.momentum7dPct, b.momentum7dPct)
        case "drawdown":
          return cmp(a.drawdownPct, b.drawdownPct)
        case "positionDelta":
          return cmp(a.positionDelta, b.positionDelta)
        case "unrealized":
          return cmp(a.unrealized, b.unrealized)
        case "signal":
          return (SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal]) * mul
        case "qty":
          return cmp(a.qty, b.qty)
        case "avgCost":
          return cmp(a.avg_cost, b.avg_cost)
        case "set":
          return cmp(a.set_name, b.set_name)
        case "perUnitDelta":
          return cmp(a.perUnitDelta, b.perUnitDelta)
        case "anchorDate":
          return cmp(a.anchorDate, b.anchorDate)
        case "lastSnapshot":
          return cmp(a.last_snapshot_date, b.last_snapshot_date)
        default:
          return 0
      }
    })
  }, [rows, sortKey, sortDir])

  if (rows.length === 0) return null

  const show = (key: SortKey) => DEFAULT_COLS.has(key) || extra.has(key)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Ranked table
        </h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => setColsOpen((o) => !o)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
          >
            Columns
            <ChevronDown size={12} />
          </button>
          {colsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-md border border-border bg-card shadow-md p-1.5 space-y-0.5">
                {EXTRA_COLS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-accent/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={extra.has(c.key)}
                      onChange={() => toggleExtra(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <Th
                sticky
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => toggleSort("name")}
              >
                Product
              </Th>
              {show("current") && (
                <Th active={sortKey === "current"} dir={sortDir} onClick={() => toggleSort("current")} align="right">
                  Current
                </Th>
              )}
              {show("windowPct") && (
                <Th active={sortKey === "windowPct"} dir={sortDir} onClick={() => toggleSort("windowPct")} align="right">
                  Window Δ%
                </Th>
              )}
              {show("momentum7d") && (
                <Th active={sortKey === "momentum7d"} dir={sortDir} onClick={() => toggleSort("momentum7d")} align="right">
                  7D Δ%
                </Th>
              )}
              {show("drawdown") && (
                <Th active={sortKey === "drawdown"} dir={sortDir} onClick={() => toggleSort("drawdown")} align="right">
                  Drawdown
                </Th>
              )}
              {show("positionDelta") && (
                <Th active={sortKey === "positionDelta"} dir={sortDir} onClick={() => toggleSort("positionDelta")} align="right">
                  Position Δ$
                </Th>
              )}
              {show("unrealized") && (
                <Th active={sortKey === "unrealized"} dir={sortDir} onClick={() => toggleSort("unrealized")} align="right">
                  Unrealized
                </Th>
              )}
              {show("signal") && (
                <Th active={sortKey === "signal"} dir={sortDir} onClick={() => toggleSort("signal")}>
                  Signal
                </Th>
              )}
              {show("qty") && (
                <Th active={sortKey === "qty"} dir={sortDir} onClick={() => toggleSort("qty")} align="right">
                  Qty
                </Th>
              )}
              {show("avgCost") && (
                <Th active={sortKey === "avgCost"} dir={sortDir} onClick={() => toggleSort("avgCost")} align="right">
                  Avg cost
                </Th>
              )}
              {show("set") && (
                <Th active={sortKey === "set"} dir={sortDir} onClick={() => toggleSort("set")}>
                  Set
                </Th>
              )}
              {show("perUnitDelta") && (
                <Th active={sortKey === "perUnitDelta"} dir={sortDir} onClick={() => toggleSort("perUnitDelta")} align="right">
                  Δ$/unit
                </Th>
              )}
              {show("anchorDate") && (
                <Th active={sortKey === "anchorDate"} dir={sortDir} onClick={() => toggleSort("anchorDate")}>
                  Anchor
                </Th>
              )}
              {show("lastSnapshot") && (
                <Th active={sortKey === "lastSnapshot"} dir={sortDir} onClick={() => toggleSort("lastSnapshot")}>
                  Last snap
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const color = colors[r.product_id]
              return (
                <tr
                  key={r.product_id}
                  className={cn(
                    "border-b border-border/60 hover:bg-accent/30 transition-colors cursor-default",
                    hoveredId === r.product_id && "bg-accent/40"
                  )}
                  onMouseEnter={() => {
                    if (!isolationDisabled) onHover(r.product_id)
                  }}
                  onMouseLeave={() => {
                    if (!isolationDisabled) onHover(null)
                  }}
                  onClick={() => onRowClick?.(r.product_id)}
                >
                  <td className="px-3 py-2 sticky left-0 bg-card z-[1]">
                    <div className="flex items-center gap-2 min-w-[160px]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: color ?? "hsl(var(--muted-foreground))" }}
                      />
                      <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
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
                      <div className="min-w-0">
                        <Link
                          href={`/products/${encodeURIComponent(r.product_id)}`}
                          className="text-xs font-medium truncate block hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.name}
                        </Link>
                        <div className="flex items-center gap-1 mt-0.5">
                          <StalenessChip staleDays={r.staleDays} />
                          {r.noPriceHistory && (
                            <span className="text-[10px] text-muted-foreground">no price history</span>
                          )}
                          {r.anchorAgeDays != null && r.anchorAgeDays > 7 && (
                            <span
                              className="text-[10px] text-amber-600 dark:text-amber-400"
                              title={`Anchor ${r.anchorAgeDays}d before window start`}
                            >
                              stale anchor
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  {show("current") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {formatCurrency(r.current_price)}
                    </td>
                  )}
                  {show("windowPct") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <PctCell v={r.windowPct} />
                    </td>
                  )}
                  {show("momentum7d") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <PctCell v={r.momentum7dPct} />
                    </td>
                  )}
                  {show("drawdown") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <PctCell v={r.drawdownPct} />
                    </td>
                  )}
                  {show("positionDelta") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <MoneyCell v={r.positionDelta} />
                    </td>
                  )}
                  {show("unrealized") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {r.unrealized != null ? (
                        <span
                          className={
                            r.unrealized >= 0 ? "text-emerald-500" : "text-red-500"
                          }
                        >
                          {formatSignedCurrency(r.unrealized)}
                          {r.unrealizedPct != null && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              ({formatPercent(r.unrealizedPct)})
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {show("signal") && (
                    <td className="px-3 py-2 text-xs">
                      <SignalBadge signal={r.signal} />
                    </td>
                  )}
                  {show("qty") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{r.qty}</td>
                  )}
                  {show("avgCost") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {formatCurrency(r.avg_cost)}
                    </td>
                  )}
                  {show("set") && (
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[140px] truncate">
                      {r.set_name || "—"}
                    </td>
                  )}
                  {show("perUnitDelta") && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      <MoneyCell v={r.perUnitDelta} />
                    </td>
                  )}
                  {show("anchorDate") && (
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.anchorDate ? formatSnapshotDate(r.anchorDate) : "—"}
                    </td>
                  )}
                  {show("lastSnapshot") && (
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.last_snapshot_date
                        ? formatSnapshotDate(r.last_snapshot_date)
                        : "—"}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({
  children,
  onClick,
  active,
  dir,
  align,
  sticky,
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  dir: "asc" | "desc"
  align?: "right"
  sticky?: boolean
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none",
        align === "right" && "text-right",
        sticky && "sticky left-0 bg-muted/40 z-[2]"
      )}
      onClick={onClick}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {children}
        {active ? (
          dir === "asc" ? (
            <ArrowUp size={12} className="opacity-70" />
          ) : (
            <ArrowDown size={12} className="opacity-70" />
          )
        ) : (
          <span className="w-3" />
        )}
      </span>
    </th>
  )
}

function PctCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={v >= 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
      {formatPercent(v)}
    </span>
  )
}

function MoneyCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={v >= 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
      {formatSignedCurrency(v)}
    </span>
  )
}

function SignalBadge({ signal }: { signal: ExitReviewSignal }) {
  const styles: Record<ExitReviewSignal, string> = {
    Accelerating: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Cooling: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    Recovering: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    Declining: "bg-red-500/15 text-red-600 dark:text-red-400",
    "Insufficient data": "bg-muted text-muted-foreground",
  }
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap", styles[signal])}>
      {signal}
    </span>
  )
}
