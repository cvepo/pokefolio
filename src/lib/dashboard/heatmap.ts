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

/**
 * How much a tile can show at its measured size.
 *
 * Treemap tiles vary enormously — the largest position can be 20x the smallest —
 * so a single fixed type scale either leaves big tiles looking empty or
 * overflows small ones. Text scales with the tile instead, and content drops in
 * priority order as space runs out.
 *
 * The money figure is the last thing to go and is NEVER truncated: a clipped
 * "$1,420.…" is worse than no figure at all, because it reads as a real number
 * while being wrong. The percentage is dropped before the value, and the
 * tooltip always carries everything (PRD §15).
 */
export type HeatmapTileScale = {
  /** Tailwind class for the product name, or null to hide it. */
  nameClass: string | null
  /** Lines the name may wrap to before clamping. */
  nameLines: number
  /** Tailwind class for the money figure, or null to hide it. */
  valueClass: string | null
  /** Tailwind class for the % change, or null to hide it. */
  changeClass: string | null
  /** Show set name + unit count — only where there is real room to fill. */
  showMeta: boolean
  /** Thumbnail edge in px; 0 means no image. */
  imageSize: number
}

export function heatmapTileScale(width: number, height: number): HeatmapTileScale {
  if (width >= 190 && height >= 116) {
    return {
      nameClass: "text-[13px] leading-tight",
      nameLines: 3,
      valueClass: "text-[18px] leading-none",
      changeClass: "text-[12px]",
      showMeta: true,
      imageSize: 44,
    }
  }
  if (width >= 132 && height >= 78) {
    return {
      nameClass: "text-[11px] leading-tight",
      nameLines: 2,
      valueClass: "text-[14px] leading-none",
      changeClass: "text-[11px]",
      showMeta: true,
      imageSize: 30,
    }
  }
  if (width >= 94 && height >= 54) {
    return {
      nameClass: "text-[10px] leading-tight",
      nameLines: 2,
      valueClass: "text-[12px] leading-none",
      changeClass: "text-[10px]",
      showMeta: false,
      imageSize: 0,
    }
  }
  if (width >= 68 && height >= 36) {
    return {
      nameClass: "text-[9px] leading-tight",
      nameLines: 1,
      valueClass: "text-[11px] leading-none",
      changeClass: null,
      showMeta: false,
      imageSize: 0,
    }
  }
  if (width >= 46 && height >= 20) {
    return {
      nameClass: null,
      nameLines: 0,
      valueClass: "text-[9px] leading-none",
      changeClass: null,
      showMeta: false,
      imageSize: 0,
    }
  }
  // Too small for any honest label — the tooltip still has the full detail.
  return {
    nameClass: null,
    nameLines: 0,
    valueClass: null,
    changeClass: null,
    showMeta: false,
    imageSize: 0,
  }
}

/** TCGplayer product image for a tile-sized thumbnail, or null when unavailable. */
export function heatmapImageUrl(tcgplayerId: string | null, size: number): string | null {
  if (!tcgplayerId || size <= 0) return null
  const fit = size <= 32 ? 64 : 128
  return `https://product-images.tcgplayer.com/fit-in/${fit}x${fit}/${tcgplayerId}.jpg`
}
