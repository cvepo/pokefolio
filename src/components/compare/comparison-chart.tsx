"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSnapshotDate,
} from "@/lib/utils"
import { StalenessChip } from "@/components/compare/freshness-banner"
import type { CompareView, SeriesAnchor } from "@/lib/compare-series"

type ChartProduct = {
  product_id: string
  name: string
  color: string
  staleDays: number | null
  qty: number
}

type ComparisonChartProps = {
  rows: Array<Record<string, number | string | null>>
  products: ChartProduct[]
  view: CompareView
  colors: Record<string, string>
  hoveredId: string | null
  anchors: Record<string, SeriesAnchor>
  basketAnchorDate: string | null
  windowStart: string
  emptyMessage?: string
}

export function ComparisonChart({
  rows,
  products,
  view,
  colors,
  hoveredId,
  anchors,
  basketAnchorDate,
  windowStart,
  emptyMessage,
}: ComparisonChartProps) {
  if (emptyMessage) {
    return (
      <div className="h-[480px] flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        {emptyMessage}
      </div>
    )
  }

  if (!rows.length || (view !== "combined_pct" && products.length === 0)) {
    return (
      <div className="h-[480px] flex items-center justify-center text-sm text-muted-foreground">
        Select products to compare
      </div>
    )
  }

  const isCombined = view === "combined_pct"
  const tickInterval = rows.length > 90 ? Math.ceil(rows.length / 8) : rows.length > 30 ? 6 : 0

  return (
    <div className="space-y-2">
      {isCombined && basketAnchorDate && basketAnchorDate > windowStart && (
        <p className="text-xs text-muted-foreground">
          Basket starts {formatSnapshotDate(basketAnchorDate)} — the earliest date all{" "}
          {products.length} selected products have prices.
        </p>
      )}
      {/* Fixed height + numeric ResponsiveContainer height avoids scrollbar resize loops */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[640px] h-[480px]">
          <ResponsiveContainer width="100%" height={480}>
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
                tickFormatter={(v) => formatSnapshotDate(String(v))}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v) =>
                  view === "position_abs"
                    ? formatCurrency(Number(v)).replace(/\.00$/, "")
                    : `${Number(v).toFixed(0)}%`
                }
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
              <Tooltip
                content={
                  <CompareTooltip
                    products={products}
                    view={view}
                    anchors={anchors}
                    hoveredId={hoveredId}
                    isCombined={isCombined}
                  />
                }
              />
              {isCombined ? (
                <Line
                  type="linear"
                  dataKey="combined"
                  name="Combined"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ) : (
                products.flatMap((p) => {
                  const isolated = hoveredId != null
                  const emphasis = !isolated || hoveredId === p.product_id
                  const opacity = emphasis ? 1 : 0.2
                  const width = hoveredId === p.product_id ? 2.5 : 1.75
                  const stroke = colors[p.product_id] ?? p.color
                  return [
                    <Line
                      key={p.product_id}
                      type="linear"
                      dataKey={p.product_id}
                      name={p.name}
                      stroke={stroke}
                      strokeWidth={width}
                      strokeOpacity={opacity}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />,
                    <Line
                      key={`${p.product_id}__dashed`}
                      type="linear"
                      dataKey={`${p.product_id}__dashed`}
                      name={`${p.name} (stale fill)`}
                      stroke={stroke}
                      strokeWidth={width}
                      strokeOpacity={opacity}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                      legendType="none"
                    />,
                  ]
                })
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function CompareTooltip({
  active,
  payload,
  label,
  products,
  view,
  anchors,
  hoveredId,
  isCombined,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | string; payload?: Record<string, unknown> }>
  label?: string | number
  products: ChartProduct[]
  view: CompareView
  anchors: Record<string, SeriesAnchor>
  hoveredId: string | null
  isCombined: boolean
}) {
  if (!active || !payload?.length) return null
  const date = String(label ?? "")
  const row = payload[0]?.payload ?? {}

  if (isCombined) {
    const total = Number(row.combined)
    const contributors = products
      .map((p) => ({
        ...p,
        value: Number(row[`contrib__${p.product_id}`] ?? 0),
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    const top = contributors.slice(0, 8)
    const more = contributors.length - top.length

    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md max-h-[320px] overflow-y-auto min-w-[200px]">
        <p className="font-medium mb-1.5">{formatSnapshotDate(date)}</p>
        <p className="font-semibold mb-2">
          Basket {Number.isFinite(total) ? formatPercent(total) : "—"}
          {row.combined$ != null && (
            <span className="text-muted-foreground font-normal">
              {" "}
              ({formatSignedCurrency(Number(row.combined$))})
            </span>
          )}
        </p>
        <ul className="space-y-1">
          {top.map((c) => (
            <li key={c.product_id} className="flex items-center justify-between gap-3">
              <span className="truncate flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: c.color }}
                />
                {c.name}
              </span>
              <span className="font-medium tabular-nums shrink-0">
                {formatSignedCurrency(c.value)}
              </span>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <p className="text-muted-foreground mt-1.5">+{more} more</p>
        )}
      </div>
    )
  }

  // Collect per-product values (prefer solid, fall back to dashed).
  const entries = products
    .map((p) => {
      const solid = row[p.product_id]
      const dashed = row[`${p.product_id}__dashed`]
      const raw = solid ?? dashed
      const value = raw == null ? null : Number(raw)
      return { ...p, value }
    })
    .filter((e) => e.value != null && Number.isFinite(e.value)) as Array<
    ChartProduct & { value: number }
  >

  entries.sort((a, b) => {
    if (hoveredId && a.product_id === hoveredId) return -1
    if (hoveredId && b.product_id === hoveredId) return 1
    return Math.abs(b.value) - Math.abs(a.value)
  })

  const top = entries.slice(0, 8)
  const more = entries.length - top.length

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md max-h-[320px] overflow-y-auto min-w-[220px]">
      <p className="font-medium mb-1.5">{formatSnapshotDate(date)}</p>
      <ul className="space-y-1">
        {top.map((e) => (
            <li key={e.product_id} className="flex items-center justify-between gap-3">
              <span className="truncate flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: e.color }}
                />
                <span className="truncate">{e.name}</span>
                <StalenessChip staleDays={e.staleDays} />
              </span>
              <span className="font-medium tabular-nums shrink-0">
                {view === "position_abs"
                  ? formatSignedCurrency(e.value)
                  : formatPercent(e.value)}
              </span>
            </li>
          ))}
      </ul>
      {more > 0 && <p className="text-muted-foreground mt-1.5">+{more} more</p>}
      {top.some((e) => anchors[e.product_id]?.stale) && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 max-w-[240px]">
          {top
            .filter((e) => anchors[e.product_id]?.stale)
            .slice(0, 2)
            .map((e) => {
              const a = anchors[e.product_id]
              return `${e.name}: anchor ${a.ageDays}d before window start`
            })
            .join("; ")}
        </p>
      )}
    </div>
  )
}
