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
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Holdings heatmap
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Size by value · colour by 1M Value Change (per unit) · clamped ±25%
          </p>
        </div>
        <HeatmapLegend />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
          No open positions.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
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
    </section>
  )
}

function tileFlexBasis(weight: number, tier: DensityTier): number {
  // Cap tile width lower on wide monitors so the flex wrap gains columns.
  const maxBasis = tier === "4xl" ? 160 : tier === "3xl" ? 200 : 280
  const minBasis = tier === "4xl" ? 72 : tier === "3xl" ? 76 : 80
  return Math.min(maxBasis, minBasis + weight / (tier === "4xl" ? 70 : 40))
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
        flexBasis: `${tileFlexBasis(weight, tier)}px`,
        background: isUnknown ? undefined : fill,
      }}
      className={cn(
        "relative min-h-[64px] min-w-[100px] max-w-full rounded-md border px-2 py-1.5 flex flex-col justify-between",
        isUnknown
          ? "border-border bg-[repeating-linear-gradient(-45deg,hsl(var(--muted)),hsl(var(--muted))_6px,hsl(var(--card))_6px,hsl(var(--card))_12px)]"
          : "border-border/80",
        state === "stale" && "ring-1 ring-amber-500/50"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-[11px] font-medium leading-snug line-clamp-2">{position.name}</p>
        {state === "stale" && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1 py-0.5 rounded">
            Stale
          </span>
        )}
        {position.priceStatus === "unknown" && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-1 py-0.5 rounded">
            No price
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <span className="text-xs font-semibold tabular-nums">
          {position.priceStatus === "unknown" ? "—" : formatCents(position.marketValue)}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            change1M == null && "text-muted-foreground",
            change1M != null && change1M >= 0 && "text-emerald-600 dark:text-emerald-400",
            change1M != null && change1M < 0 && "text-red-600 dark:text-red-400"
          )}
        >
          {change1M == null ? (
            <span className="inline-flex items-center gap-1">
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
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
      <span className="inline-flex items-center gap-1">
        <span className="w-3 h-3 rounded-sm bg-emerald-500/50" aria-hidden /> Gain
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-3 h-3 rounded-sm bg-red-500/50" aria-hidden /> Loss
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="w-3 h-3 rounded-sm border border-border bg-[repeating-linear-gradient(-45deg,#8883_0_2px,transparent_2px_4px)]"
          aria-hidden
        />{" "}
        Unknown / no history
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1 rounded">
          Stale
        </span>{" "}
        label on tile
      </span>
    </div>
  )
}
