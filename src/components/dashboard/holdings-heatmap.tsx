"use client"

import type { Position, PositionsPayload } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import {
  heatmapFillCss,
  heatmapNormalized,
  heatmapSizeWeight,
  heatmapTileState,
} from "@/lib/dashboard/heatmap"
import type { DensityTier } from "@/components/dashboard/density"
import { heatmapTileFlexBasis } from "@/components/dashboard/density"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

type HoldingsHeatmapProps = {
  positions: PositionsPayload
  /** Wider tiers reflow into more columns instead of growing tiles. */
  tier?: DensityTier
}

/**
 * Size = market value, colour = 1M per-unit Value Change clamped ±25% (PRD §15).
 * Stale / unknown / no-history are visually distinct — never colour-alone.
 */
export function HoldingsHeatmap({ positions, tier = "base" }: HoldingsHeatmapProps) {
  const { min, max } = positions.heatmapColorDomain
  const sorted = [...positions.positions].sort((a, b) => b.marketValue - a.marketValue)

  return (
    <DashboardPanel
      title="Holdings heatmap"
      actions={<HeatmapLegend />}
      bodyClassName="!p-1.5"
    >
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-sm">
          No open positions.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {sorted.map((p) => (
            <HeatmapTile
              key={p.productId}
              position={p}
              domainMin={min}
              domainMax={max}
              tier={tier}
            />
          ))}
        </div>
      )}
    </DashboardPanel>
  )
}

function HeatmapTile({
  position,
  domainMin,
  domainMax,
  tier,
}: {
  position: Position
  domainMin: number
  domainMax: number
  tier: DensityTier
}) {
  const change1M = position.valueChangePct["1M"]
  const state = heatmapTileState(change1M, position.priceStatus)
  const weight = heatmapSizeWeight(position.marketValue)
  const isUnknown = state === "unknown"
  const fill =
    !isUnknown && change1M != null
      ? heatmapFillCss(heatmapNormalized(change1M, domainMin, domainMax))
      : undefined

  const title = [
    position.name,
    `${position.quantity} units`,
    `Value ${formatCents(position.marketValue)}`,
    `1M Value Change ${formatValueChangePct(change1M)}`,
    position.priceStatus !== "ok" ? `Price: ${position.priceStatus}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      title={title}
      style={{
        flexGrow: weight,
        flexBasis: `${heatmapTileFlexBasis(weight, tier)}px`,
        background: isUnknown ? undefined : fill,
      }}
      className={cn(
        "relative min-h-[48px] min-w-[80px] max-w-full rounded-sm border px-1.5 py-1 flex flex-col justify-between",
        isUnknown
          ? "border-border bg-[repeating-linear-gradient(-45deg,hsl(var(--muted)),hsl(var(--muted))_6px,hsl(var(--card))_6px,hsl(var(--card))_12px)]"
          : "border-border/80",
        state === "stale" && "ring-1 ring-amber-500/50"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-medium leading-snug line-clamp-2">{position.name}</p>
        {state === "stale" && (
          <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1 py-0.5 rounded-sm">
            Stale
          </span>
        )}
        {position.priceStatus === "unknown" && (
          <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-1 py-0.5 rounded-sm">
            No price
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-1 mt-0.5">
        <span className="text-[11px] font-semibold tabular-nums">
          {position.priceStatus === "unknown" ? "—" : formatCents(position.marketValue)}
        </span>
        <span
          className={cn(
            "text-[10px] font-semibold tabular-nums",
            change1M == null && "text-muted-foreground",
            change1M != null && change1M >= 0 && "text-emerald-600 dark:text-emerald-400",
            change1M != null && change1M < 0 && "text-red-600 dark:text-red-400"
          )}
        >
          {change1M == null ? (
            <span className="inline-flex items-center gap-0.5">
              <span aria-hidden>⌀</span> Unknown
            </span>
          ) : (
            formatValueChangePct(change1M)
          )}
        </span>
      </div>
    </div>
  )
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap justify-end">
      <span className="inline-flex items-center gap-0.5">
        <span className="w-2 h-2 rounded-sm bg-emerald-500/50" aria-hidden /> Gain
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="w-2 h-2 rounded-sm bg-red-500/50" aria-hidden /> Loss
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span
          className="w-2 h-2 rounded-sm border border-border bg-[repeating-linear-gradient(-45deg,#8883_0_2px,transparent_2px_4px)]"
          aria-hidden
        />{" "}
        Unknown
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="text-[8px] font-bold uppercase text-amber-700 dark:text-amber-300 bg-amber-500/15 px-0.5 rounded-sm">
          Stale
        </span>
      </span>
    </div>
  )
}
