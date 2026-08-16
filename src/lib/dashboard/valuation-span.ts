import type { PerformancePoint, ValuationBasis } from "@/lib/dashboard/contract"

export type ValuationSpan = {
  from: string
  to: string
  /** "cost" if every point in the span was pure cost basis, else "partial". */
  basis: Exclude<ValuationBasis, "market">
}

/**
 * Find the contiguous date ranges where the actual line is not a pure market
 * valuation.
 *
 * Pokéfolio only has prices from the day it began tracking a product, so the
 * earliest part of the chart is valued at cost basis instead (matching
 * `/dashboard` and `/data`). That is a legitimate figure, but it is not the
 * same kind of number as the rest of the line, and PRD §8 forbids substituting
 * a value without indicating it. Returning the spans lets the chart shade them.
 *
 * Ranges are returned rather than a flag per point because a shaded band reads
 * as "this era is different", which is the actual claim, where per-point marks
 * would just look like noise.
 */
export function estimatedValuationSpans(series: PerformancePoint[]): ValuationSpan[] {
  const spans: ValuationSpan[] = []
  let current: { from: string; to: string; allCost: boolean } | null = null

  for (const point of series) {
    const estimated = point.actualBasis === "cost" || point.actualBasis === "partial"
    if (estimated) {
      const isCost = point.actualBasis === "cost"
      if (current) {
        current.to = point.date
        current.allCost = current.allCost && isCost
      } else {
        current = { from: point.date, to: point.date, allCost: isCost }
      }
    } else if (current) {
      spans.push({ from: current.from, to: current.to, basis: current.allCost ? "cost" : "partial" })
      current = null
    }
  }

  if (current) {
    spans.push({ from: current.from, to: current.to, basis: current.allCost ? "cost" : "partial" })
  }

  return spans
}

/** Human label for a point's valuation basis, for tooltips. */
export function valuationBasisLabel(basis: ValuationBasis | null): string | null {
  switch (basis) {
    case "cost":
      return "Valued at cost — no market prices recorded yet"
    case "partial":
      return "Partly valued at cost — some holdings not priced yet"
    case "market":
      return null
    default:
      return null
  }
}
