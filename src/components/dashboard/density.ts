/**
 * Dashboard 2.0 density tiers — layout-only helpers.
 *
 * Breakpoints match globals.css `--breakpoint-3xl` / `--breakpoint-4xl`
 * (1920px / 2400px). Chart heights stay concrete pixel numbers for
 * ResponsiveContainer — never percentages (scrollbar resize loop).
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

/** Numeric chart height for ResponsiveContainer — never "%" / h-full. */
export function chartHeightForWidth(width: number): number {
  const tier = densityTierForWidth(width)
  if (tier === "4xl") return 400
  if (tier === "3xl") return 340
  return 280
}

/**
 * What Changed display cap (PRD §19) — rendering only, never filters storage.
 * Wider viewports can show more rows; the "N shown / M total" counter stays honest.
 */
export function insightDisplayCapForWidth(width: number): number {
  const tier = densityTierForWidth(width)
  if (tier === "4xl") return 12
  if (tier === "3xl") return 8
  return INSIGHT_DISPLAY_CAP
}

/**
 * Heatmap tile flex-basis — wider tiers cap tile width so wrap gains columns
 * instead of stretching tiles unboundedly.
 */
export function heatmapTileFlexBasis(weight: number, tier: DensityTier): number {
  const maxBasis = tier === "4xl" ? 160 : tier === "3xl" ? 200 : 280
  const minBasis = tier === "4xl" ? 72 : tier === "3xl" ? 76 : 80
  const divisor = tier === "4xl" ? 70 : 40
  return Math.min(maxBasis, minBasis + weight / divisor)
}
