"use client"

import { useEffect, useState } from "react"
import {
  chartHeightForWidth,
  densityTierForWidth,
  holdingPeriodSeparate,
  insightDisplayCapForWidth,
  type DensityTier,
} from "@/components/dashboard/density"

export type DashboardDensity = {
  width: number
  tier: DensityTier
  /** Fallback only — chart prefers ResizeObserver measurement. */
  chartHeight: number
  insightCap: number
  holdingPeriodSeparate: boolean
}

const SSR_DEFAULT: DashboardDensity = {
  width: 1280,
  tier: "xl",
  chartHeight: 200,
  insightCap: 5,
  holdingPeriodSeparate: false,
}

/**
 * Viewport-driven density for display caps and fallback chart height.
 * Defaults match the 15" laptop tier so SSR/hydration stay stable.
 */
export function useDashboardDensity(): DashboardDensity {
  const [density, setDensity] = useState<DashboardDensity>(SSR_DEFAULT)

  useEffect(() => {
    function measure() {
      const width = window.innerWidth
      const tier = densityTierForWidth(width)
      setDensity({
        width,
        tier,
        chartHeight: chartHeightForWidth(width),
        insightCap: insightDisplayCapForWidth(width),
        holdingPeriodSeparate: holdingPeriodSeparate(tier),
      })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  return density
}
