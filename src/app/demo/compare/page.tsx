"use client"

import { useEffect, useMemo, useState } from "react"
import { LineChart } from "lucide-react"
import type { Timeframe } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import { useDemoStore } from "@/lib/demo/use-demo-store"
import { cn } from "@/lib/utils"

const WINDOWS: Timeframe[] = ["7D", "1M", "3M", "6M", "1Y", "MAX"]

/**
 * Demo Compare — positions from DemoStore only.
 *
 * The live page needs per-product price history (`CompareSeriesResponse`).
 * DemoStore does not expose history yet, so this surface shows per-position
 * Value Change from `getDashboard` rather than inventing series. See
 * docs/demo/ui-notes.md.
 */
export default function DemoComparePage() {
  const store = useDemoStore()
  const [window, setWindow] = useState<Timeframe>("1M")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  const positions = store.getDashboard(undefined, window).data.positions.positions

  const rows = useMemo(() => {
    return positions
      .map((p) => ({
        id: p.productId,
        name: p.name,
        setName: p.setName,
        qty: p.quantity,
        value: p.marketValue,
        change: p.valueChangePct[window],
        signal: p.signal,
      }))
      .sort((a, b) => {
        const ca = a.change
        const cb = b.change
        if (ca == null && cb == null) return 0
        if (ca == null) return 1
        if (cb == null) return -1
        return Math.abs(cb) - Math.abs(ca)
      })
  }, [positions, window])

  useEffect(() => {
    if (initialized || rows.length === 0) return
    setSelected(new Set(rows.slice(0, Math.min(5, rows.length)).map((r) => r.id)))
    setInitialized(true)
  }, [rows, initialized])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visible = rows.filter((r) => selected.has(r.id))

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LineChart size={22} /> Compare
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Value Change across open sample positions. Full price-history charts need a
          store method that is not on the contract yet.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {WINDOWS.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setWindow(tf)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
              window === tf
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        <div className="border border-border rounded-lg p-3 bg-card space-y-1 max-h-[420px] overflow-auto">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Positions
          </p>
          {rows.map((r) => (
            <label key={r.id} className="flex items-start gap-2 text-xs py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="font-medium block truncate">{r.name}</span>
                <span className="text-muted-foreground truncate block">{r.setName}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="border border-border rounded-lg overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Value</th>
                <th className="px-4 py-3 font-medium text-right">Value Change ({window})</th>
                <th className="px-4 py-3 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Select positions to compare.
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.setName}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(r.value)}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        r.change == null
                          ? "text-muted-foreground"
                          : r.change >= 0
                            ? "text-emerald-500"
                            : "text-red-500"
                      )}
                    >
                      {r.change == null ? "—" : formatValueChangePct(r.change)}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.signal}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
