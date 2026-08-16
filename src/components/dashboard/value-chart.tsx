"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PerformancePoint, Timeframe } from "@/lib/dashboard/contract"
import { centsToDollars } from "@/lib/dashboard/contract"
import { formatCents } from "@/lib/dashboard/format"
import { formatSnapshotDate } from "@/lib/utils"

type ValueChartProps = {
  series: PerformancePoint[]
  seriesTimeframe: Timeframe
}

/**
 * Actual (solid) + Projected (dashed), both labelled — PRD §16.
 * Fixed pixel height + numeric ResponsiveContainer height avoids the
 * Compare-chart scrollbar resize loop.
 */
export function ValueChart({ series, seriesTimeframe }: ValueChartProps) {
  const rows = series.map((p) => ({
    date: p.date,
    actual: p.actual == null ? null : centsToDollars(p.actual),
    projected: p.projected == null ? null : centsToDollars(p.projected),
  }))

  const values = rows.flatMap((r) =>
    [r.actual, r.projected].filter((v): v is number => v != null && Number.isFinite(v))
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
    <div className="border border-border rounded-xl p-5 bg-card">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Portfolio value
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Actual vs projected · {seriesTimeframe}
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-md text-right">
          Projected applies today’s holdings to historical prices. Lines may cross —
          that is meaningful.
        </p>
      </div>

      {rows.length < 2 ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
          Not enough history for this window
        </div>
      ) : (
        /* Fixed height + numeric ResponsiveContainer height avoids scrollbar resize loops */
        <div className="w-full overflow-x-auto">
          <div className="min-w-[560px] h-[280px]">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatSnapshotDate(String(v))}
                  interval={rows.length > 20 ? Math.ceil(rows.length / 7) : 0}
                />
                <YAxis
                  domain={chartYDomain ?? ["auto", "auto"]}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  tickFormatter={(v) => `$${Math.round(Number(v)).toLocaleString()}`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value) => String(value)}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | string; color?: string }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md min-w-[160px]">
      <p className="font-medium mb-1.5">{formatSnapshotDate(String(label ?? ""))}</p>
      <ul className="space-y-1">
        {payload.map((p) => {
          const key = String(p.dataKey)
          const raw = p.value
          const display =
            raw == null || raw === ""
              ? "—"
              : formatCents(Math.round(Number(raw) * 100))
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: p.color,
                    outline: key === "projected" ? "1px dashed currentColor" : undefined,
                  }}
                />
                {key === "actual" ? "Actual" : "Projected"}
              </span>
              <span className="font-medium tabular-nums">{display}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
