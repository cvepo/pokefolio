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

/**
 * Heatmap tile flex-basis — wider tiers cap tile width so wrap gains columns
 * instead of stretching tiles unboundedly.
 */
export function heatmapTileFlexBasis(weight: number, tier: DensityTier): number {
  const maxBasis = tier === "4xl" ? 140 : tier === "3xl" ? 160 : 200
  const minBasis = tier === "4xl" ? 64 : tier === "3xl" ? 68 : 72
  const divisor = tier === "4xl" ? 80 : 50
  return Math.min(maxBasis, minBasis + weight / divisor)
}

/** Holding period is a separate pane only at ≥1920; below that it shares Activity. */
export function holdingPeriodSeparate(tier: DensityTier): boolean {
  return tier === "3xl" || tier === "4xl"
}
