import { daysBetween } from "@/lib/compare-series"
import type { PriceStatus } from "@/lib/dashboard/contract"

export function derivePriceStatus(opts: {
  currentPrice: number | null
  lastPricedAt: string | null
  asOfDate: string
  failedLastSync: boolean
  expectedWindowDays: number
}): PriceStatus {
  if (opts.currentPrice == null) return "unknown"

  // A known price without a provenance date is still usable for valuation, but
  // cannot honestly be described as current.
  if (opts.failedLastSync || opts.lastPricedAt == null) return "stale"
  return daysBetween(opts.lastPricedAt, opts.asOfDate) > opts.expectedWindowDays
    ? "stale"
    : "ok"
}
