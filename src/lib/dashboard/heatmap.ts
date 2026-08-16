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
 * Treemap tiles vary ~20x in area, so a fixed type scale either leaves the big
 * ones looking empty or overflows the small ones. Sizes are computed
 * continuously from the tile's own dimensions and applied as inline pixel
 * values rather than snapped to a handful of Tailwind classes — a 300px tile
 * and a 140px tile should not wear the same 11px type.
 *
 * Content drops in priority order as room runs out: image, then meta, then the
 * percentage, then the name. The money figure is last and is NEVER truncated —
 * a clipped "$1,420.…" reads as a real number while being wrong. The tooltip
 * always carries everything (PRD §15).
 */
export type HeatmapTileScale = {
  /** Font px for the product name; 0 hides it. */
  nameFontPx: number
  /** Lines the name may wrap to. */
  nameLines: number
  /** Font px for the money figure; 0 hides it. */
  valueFontPx: number
  /** Font px for the % change; 0 hides it. */
  changeFontPx: number
  /** Font px for the "N units · Set" line; 0 hides it. */
  metaFontPx: number
  /** Thumbnail edge in px; 0 means no image. */
  imageSize: number
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** Widest money string we expect, e.g. "$15,483.48" — used to keep it unclipped. */
const VALUE_CHARS = 10
/** Rough advance width of the mono digit font, as a fraction of font size. */
const MONO_ADVANCE = 0.62

export function heatmapTileScale(width: number, height: number): HeatmapTileScale {
  const empty: HeatmapTileScale = {
    nameFontPx: 0,
    nameLines: 0,
    valueFontPx: 0,
    changeFontPx: 0,
    metaFontPx: 0,
    imageSize: 0,
  }
  if (width < 44 || height < 18) return empty

  const padding = 12
  const inner = Math.max(0, width - padding)

  // The value must fit on one line at its own font size, so derive the size
  // from the available width rather than hoping it fits.
  const valueFontPx = clamp(Math.floor(inner / (VALUE_CHARS * MONO_ADVANCE)), 9, 22)

  if (width < 68 || height < 34) {
    return { ...empty, valueFontPx: Math.min(valueFontPx, 11) }
  }

  const shortSide = Math.min(width, height)
  const nameFontPx = clamp(Math.floor(shortSide / 7.5), 9, 16)

  // Percentage shares the value's row, so only show it when both fit.
  const changeFontPx =
    inner >= valueFontPx * VALUE_CHARS * MONO_ADVANCE + 46
      ? clamp(Math.round(valueFontPx * 0.72), 9, 13)
      : 0

  const showMeta = width >= 130 && height >= 82
  const metaFontPx = showMeta ? clamp(Math.round(nameFontPx * 0.75), 8, 11) : 0

  const imageSize =
    width >= 120 && height >= 72 ? clamp(Math.round(shortSide * 0.4), 26, 88) : 0

  // Whatever vertical room is left after the figure row and meta line belongs
  // to the name, so tall tiles wrap onto more lines instead of leaving a void.
  const reserved = valueFontPx * 1.3 + metaFontPx * 1.4 + 10
  const nameLines = clamp(Math.floor((height - reserved) / (nameFontPx * 1.25)), 1, 4)

  return { nameFontPx, nameLines, valueFontPx, changeFontPx, metaFontPx, imageSize }
}

/**
 * Background-removed product thumbnail for a tile, or null when unavailable.
 *
 * Points at our own route rather than TCGplayer directly: their JPEGs carry a
 * solid white studio background, which reads as a pasted rectangle on a dark
 * tile. The route serves a cut-out PNG cached in Supabase Storage.
 */
export function heatmapImageUrl(tcgplayerId: string | null, size: number): string | null {
  if (!tcgplayerId || size <= 0) return null
  // Request at 2x so the thumbnail stays sharp on a retina display.
  return `/api/product-image/${tcgplayerId}?size=${Math.min(256, Math.max(64, size * 2))}`
}
