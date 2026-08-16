/**
 * Dashboard 2.0 density tiers — layout-only helpers.
 *
 * Breakpoints match globals.css `--breakpoint-3xl` / `--breakpoint-4xl`
 * (1920px / 2400px). Chart heights stay concrete pixel numbers for
 * ResponsiveContainer — never percentages (scrollbar resize loop).
 * Prefer ResizeObserver-measured pane height when available; these
 * values are fallbacks only.
 */

import { INSIGHT_DISPLAY_CAP } from "@/lib/dashboard/insights"

export const DENSITY_XL_PX = 1280
export const DENSITY_3XL_PX = 1920
export const DENSITY_4XL_PX = 2400

export type DensityTier = "base" | "xl" | "3xl" | "4xl"

export function densityTierForWidth(width: number): DensityTier {
  if (width >= DENSITY_4XL_PX) return "4xl"
  if (width >= DENSITY_3XL_PX) return "3xl"
  if (width >= DENSITY_XL_PX) return "xl"
  return "base"
}

/**
 * Fallback chart height when the pane has not been measured yet.
 * Live chart uses ResizeObserver — never pass "%" / h-full.
 */
export function chartHeightForWidth(width: number): number {
  const tier = densityTierForWidth(width)
  if (tier === "4xl") return 320
  if (tier === "3xl") return 260
  return 200
}

/**
 * What Changed display cap (PRD §19) — rendering only, never filters storage.
 * Wider viewports can show more rows; the "N shown / M total" counter stays honest.
 */
export function insightDisplayCapForWidth(width: number): number {
  const tier = densityTierForWidth(width)
  if (tier === "4xl") return 16
  if (tier === "3xl") return 10
  return INSIGHT_DISPLAY_CAP
}

/*
 * There is deliberately no heatmap tile-sizing helper here.
 *
 * A per-tier flex-basis clamp used to live at this spot, and it broke the
 * encoding PRD §15 requires: bounding every tile between 64px and 140px meant a
 * position worth 20x another rendered barely 2x wider, and the min-widths
 * pushed the last tile of each row past the pane edge. Tile geometry now comes
 * from the squarified treemap in `@/lib/dashboard/treemap`, which makes area
 * proportional to value and fills the pane exactly.
 */

/** Holding period is a separate pane only at ≥1920; below that it shares Activity. */
export function holdingPeriodSeparate(tier: DensityTier): boolean {
  return tier === "3xl" || tier === "4xl"
}
