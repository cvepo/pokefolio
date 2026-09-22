"use client"

import { useEffect, useRef, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PerformancePoint, Timeframe, ValuationBasis } from "@/lib/dashboard/contract"
import { centsToDollars } from "@/lib/dashboard/contract"
import { formatCents } from "@/lib/dashboard/format"
import { cn, formatSnapshotDate } from "@/lib/utils"
import { estimatedValuationSpans, valuationBasisLabel } from "@/lib/dashboard/valuation-span"
import { DashboardPanel } from "@/components/dashboard/panel"

type ValueChartProps = {
  series: PerformancePoint[]
  seriesTimeframe: Timeframe
  /**
   * Fallback pixel height until ResizeObserver measures the pane.
   * Never pass "%" or rely on h-full for ResponsiveContainer.
   */
  height?: number
}

/**
 * Two value series over the same window (PRD §16).
 *
 * "Projected" was the PRD's name for the second line and it misled: the word
 * means forecast everywhere else in finance, while this series is the opposite
 * — a backward-looking counterfactual. It takes the quantities held *today* and
 * prices them on each past date, so the gap between the lines is the effect of
 * the buying and selling actually done. The PRD says as much ("not a
 * forward-looking forecast"); the label just did not.
 *
 * Renamed to "Today's holdings", which states what the series is rather than
 * what it is not. The API field keeps its name — this is a display change, the
 * same way Value Change is labelled honestly without renaming the data.
 *
 * Chart height is a concrete number from ResizeObserver (or fallback) — never
 * percentage / h-full (scrollbar resize loop).
 */
export type ValueSeriesMode = "actual" | "todays" | "both"

const SERIES_MODES: Array<{ id: ValueSeriesMode; label: string }> = [
  { id: "actual", label: "Actual" },
  { id: "todays", label: "Today's" },
  { id: "both", label: "Both" },
]
export function ValueChart({ series, seriesTimeframe, height: fallbackHeight = 200 }: ValueChartProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(0)
  // Both by default: the comparison is the point of the pane, and isolating a
  // line is for when the overlay gets busy.
  const [mode, setMode] = useState<ValueSeriesMode>("both")
  const showActual = mode === "actual" || mode === "both"
  const showTodays = mode === "todays" || mode === "both"

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.height ?? 0)
      if (next > 0) setMeasuredHeight(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = measuredHeight > 0 ? measuredHeight : fallbackHeight

  const rows = series.map((p) => ({
    date: p.date,
    actual: p.actual == null ? null : centsToDollars(p.actual),
    projected: p.projected == null ? null : centsToDollars(p.projected),
    actualBasis: p.actualBasis,
  }))

  // Dates before price tracking began are valued at cost basis, not market.
  // Shading them keeps the line continuous without implying the whole series
  // is the same kind of measurement.
  const estimatedSpans = estimatedValuationSpans(series)

  // Scale to what is actually drawn — keeping a hidden series in the domain
  // squashes the visible line into a corner of the pane.
  const values = rows.flatMap((r) =>
    [showActual ? r.actual : null, showTodays ? r.projected : null].filter(
      (v): v is number => v != null && Number.isFinite(v)
    )
  )
  const chartYDomain = (() => {
    if (values.length < 2) return undefined
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    const pad = span > 0 ? span * 0.06 : Math.max(Math.abs(min) * 0.02, 10)
    return [min - pad, max + pad] as [number, number]
  })()

  return (
    <DashboardPanel
      title={`Portfolio value · ${seriesTimeframe}`}
      scrollBody={false}
      actions={
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden 3xl:inline truncate max-w-[22rem] text-right text-[10px]">
            Today’s holdings = what you hold now, at past prices
          </span>
          <div
            role="group"
            aria-label="Which value series to show"
            className="flex items-center rounded-sm border border-border overflow-hidden shrink-0"
          >
            {SERIES_MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                aria-pressed={mode === option.id}
                className={cn(
                  "px-1.5 py-px text-[10px] font-medium transition-colors",
                  mode === option.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      }
      bodyClassName="!p-1.5 gap-1"
    >
      {estimatedSpans.length > 0 && (
        <p className="shrink-0 text-[10px] text-muted-foreground flex items-center gap-1.5 px-0.5">
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-sm bg-muted-foreground/20 border border-border"
          />
          Shaded dates valued at cost basis — no market prices yet.
        </p>
      )}

      {rows.length < 2 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-muted-foreground">
          Not enough history for this window
        </div>
      ) : (
        <div ref={bodyRef} className="flex-1 min-h-0 min-w-0 w-full">
          <div className="tabular-nums w-full h-full" style={{ height }}>
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatSnapshotDate(String(v))}
                  interval={rows.length > 20 ? Math.ceil(rows.length / 7) : 0}
                />
                <YAxis
                  domain={chartYDomain ?? ["auto", "auto"]}
                  tick={{
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => `$${Math.round(Number(v)).toLocaleString()}`}
                />
                {estimatedSpans.map((span) => (
                  <ReferenceArea
                    key={`${span.from}-${span.to}`}
                    x1={span.from}
                    x2={span.to}
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.1}
                    stroke="none"
                    ifOverflow="extendDomain"
                  />
                ))}
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={22}
                  formatter={(value) => String(value)}
                  wrapperStyle={{ fontSize: 10 }}
                />
                {showActual && <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />}
                {showTodays && <Line
                  type="monotone"
                  dataKey="projected"
                  name="Today’s holdings"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </DashboardPanel>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    value?: number | string
    color?: string
    payload?: { actualBasis?: ValuationBasis | null }
  }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  // Never let colour or shading be the only signal that a figure is estimated
  // rather than measured — state it in words too.
  const basisNote = valuationBasisLabel(payload[0]?.payload?.actualBasis ?? null)
  return (
    <div className="rounded-sm border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-sm min-w-[150px]">
      <p className="font-medium mb-1">{formatSnapshotDate(String(label ?? ""))}</p>
      <ul className="space-y-0.5">
        {payload.map((p) => {
          const key = String(p.dataKey)
          const raw = p.value
          const display =
            raw == null || raw === ""
              ? "—"
              : formatCents(Math.round(Number(raw) * 100))
          return (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-none shrink-0"
                  style={{
                    background: p.color,
                    outline: key === "projected" ? "1px dashed currentColor" : undefined,
                  }}
                />
                {key === "actual" ? "Actual" : "Today’s holdings"}
              </span>
              <span className="font-medium tabular-nums">{display}</span>
            </li>
          )
        })}
      </ul>
      {basisNote && (
        <p className="mt-1 pt-1 border-t border-border text-[10px] text-muted-foreground">
          {basisNote}
        </p>
      )}
    </div>
  )
}
