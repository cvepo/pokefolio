import type { PriceIndex } from "@/lib/price-lookup"

export type TrackedAth = { price: number; date: string; drawdownPct: number | null }

export function computeTrackedAth(
  index: PriceIndex,
  productId: string,
  currentPrice: number | null
): TrackedAth | null {
  const prices = index[productId]?.filter((point) => Number.isFinite(point.price) && point.price > 0)
  if (!prices?.length) return null
  const highest = prices.reduce((best, point) => point.price > best.price ? point : best)
  return {
    price: highest.price,
    date: highest.date,
    drawdownPct: currentPrice == null ? null : (currentPrice - highest.price) / highest.price,
  }
}
