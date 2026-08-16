"use client"

import { useEffect, useState } from "react"
import {
  chartHeightForWidth,
  densityTierForWidth,
  insightDisplayCapForWidth,
  type DensityTier,
} from "@/components/dashboard/density"

export type DashboardDensity = {
  width: number
  tier: DensityTier
  chartHeight: number
  insightCap: number
}

const SSR_DEFAULT: DashboardDensity = {
  width: 1280,
  tier: "xl",
  chartHeight: 280,
  insightCap: 5,
}

/**
 * Viewport-driven density for chart height and display caps.
 * Defaults match the 15" laptop tier so SSR/hydration stay stable;
 * updates after mount when the real width is known.
 */
export function useDashboardDensity(): DashboardDensity {
  const [density, setDensity] = useState<DashboardDensity>(SSR_DEFAULT)

  useEffect(() => {
    function measure() {
      const width = window.innerWidth
      setDensity({
        width,
        tier: densityTierForWidth(width),
        chartHeight: chartHeightForWidth(width),
        insightCap: insightDisplayCapForWidth(width),
      })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  return density
}
