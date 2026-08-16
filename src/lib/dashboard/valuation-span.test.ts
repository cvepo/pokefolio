import { describe, expect, it } from "vitest"
import type { PerformancePoint, ValuationBasis } from "@/lib/dashboard/contract"
import { estimatedValuationSpans, valuationBasisLabel } from "./valuation-span"

function point(date: string, actualBasis: ValuationBasis | null): PerformancePoint {
  return { date, actual: actualBasis == null ? null : 1000, projected: 1000, actualBasis }
}

describe("estimatedValuationSpans", () => {
  it("returns nothing when the whole series is a market valuation", () => {
    const series = ["2026-01-01", "2026-01-02"].map((d) => point(d, "market"))
    expect(estimatedValuationSpans(series)).toEqual([])
  })

  it("marks the leading pre-tracking span, which is the real-world case", () => {
    const series = [
      point("2026-01-01", "cost"),
      point("2026-01-02", "cost"),
      point("2026-01-03", "market"),
      point("2026-01-04", "market"),
    ]
    expect(estimatedValuationSpans(series)).toEqual([
      { from: "2026-01-01", to: "2026-01-02", basis: "cost" },
    ])
  })

  it("downgrades a span to partial when any day inside it was partly priced", () => {
    const series = [
      point("2026-01-01", "cost"),
      point("2026-01-02", "partial"),
      point("2026-01-03", "market"),
    ]
    expect(estimatedValuationSpans(series)).toEqual([
      { from: "2026-01-01", to: "2026-01-02", basis: "partial" },
    ])
  })

  it("keeps separate spans separate rather than merging across market days", () => {
    const series = [
      point("2026-01-01", "cost"),
      point("2026-01-02", "market"),
      point("2026-01-03", "partial"),
      point("2026-01-04", "market"),
    ]
    expect(estimatedValuationSpans(series)).toEqual([
      { from: "2026-01-01", to: "2026-01-01", basis: "cost" },
      { from: "2026-01-03", to: "2026-01-03", basis: "partial" },
    ])
  })

  it("closes a span that runs to the end of the series", () => {
    const series = [point("2026-01-01", "market"), point("2026-01-02", "cost")]
    expect(estimatedValuationSpans(series)).toEqual([
      { from: "2026-01-02", to: "2026-01-02", basis: "cost" },
    ])
  })

  it("ignores points with no actual value at all", () => {
    const series = [point("2026-01-01", null), point("2026-01-02", "market")]
    expect(estimatedValuationSpans(series)).toEqual([])
  })
})

describe("valuationBasisLabel", () => {
  it("says nothing for a plain market valuation", () => {
    expect(valuationBasisLabel("market")).toBeNull()
    expect(valuationBasisLabel(null)).toBeNull()
  })

  it("explains estimated valuations in words, not just colour", () => {
    expect(valuationBasisLabel("cost")).toMatch(/cost/i)
    expect(valuationBasisLabel("partial")).toMatch(/cost/i)
  })
})
