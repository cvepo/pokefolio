/**
 * Holdings heatmap colour math (PRD §15).
 *
 * Colour = 1M per-unit Value Change, clamped to ±25% so one extreme mover
 * cannot flatten the scale. Null history and unknown prices are separate
 * visual states — never painted as 0%.
 */

import type { Fraction, PriceStatus } from "@/lib/dashboard/contract"

export const HEATMAP_CLAMP = 0.25 as const

export type HeatmapTileState = "normal" | "stale" | "unknown"

/**
 * Decide the tile's primary visual state.
 * Unknown wins over colour when 1M history is missing or price is unknown.
 * Stale is layered on top of a coloured (or unknown) fill via a badge.
 */
export function heatmapTileState(
  change1M: Fraction | null | undefined,
  priceStatus: PriceStatus
): HeatmapTileState {
  if (priceStatus === "unknown" || change1M == null) return "unknown"
  if (priceStatus === "stale") return "stale"
  return "normal"
}

/** Clamp a fraction into the fixed colour domain. */
export function clampHeatmapChange(
  fraction: Fraction,
  domainMin: Fraction = -HEATMAP_CLAMP,
  domainMax: Fraction = HEATMAP_CLAMP
): Fraction {
  return Math.min(domainMax, Math.max(domainMin, fraction))
}

/**
 * Map a clamped fraction to a unit position in [-1, 1] within the domain.
 * -1 = domainMin (red), 0 = neutral, +1 = domainMax (green).
 */
export function heatmapNormalized(
  fraction: Fraction,
  domainMin: Fraction = -HEATMAP_CLAMP,
  domainMax: Fraction = HEATMAP_CLAMP
): number {
  const clamped = clampHeatmapChange(fraction, domainMin, domainMax)
  if (clamped >= 0) {
    return domainMax === 0 ? 0 : clamped / domainMax
  }
  return domainMin === 0 ? 0 : clamped / Math.abs(domainMin)
}

/**
 * CSS background for a known change. Colour alone is never the only cue —
 * callers must also show the numeric change in the tooltip/label.
 */
export function heatmapFillCss(normalized: number): string {
  // Emerald / red at ~35% opacity so text stays readable on the tile.
  if (normalized >= 0) {
    const a = 0.08 + normalized * 0.42
    return `rgba(16, 185, 129, ${a.toFixed(3)})`
  }
  const a = 0.08 + Math.abs(normalized) * 0.42
  return `rgba(239, 68, 68, ${a.toFixed(3)})`
}

/** Flex-grow weight from market value; floors at 1 so tiny positions stay visible. */
export function heatmapSizeWeight(marketValueCents: number): number {
  if (!Number.isFinite(marketValueCents) || marketValueCents <= 0) return 1
  return Math.max(1, Math.round(marketValueCents / 100))
}
