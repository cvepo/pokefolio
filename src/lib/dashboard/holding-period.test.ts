import { describe, expect, it } from "vitest"
import type { Position } from "@/lib/dashboard/contract"
import { formatAgeDays, rollupHoldingPeriod } from "@/lib/dashboard/holding-period"

function pos(
  partial: Partial<Position> &
    Pick<Position, "productId" | "marketValue" | "holdingPeriod">
): Position {
  return {
    name: partial.productId,
    setId: "s",
    setName: "S",
    tcgplayerId: null,
    category: "ETB",
    categorySource: "inferred",
    quantity: 1,
    currentUnitPrice: 100,
    costBasis: 80,
    avgUnitCost: 80,
    unrealizedPnl: 20,
    unrealizedPnlPct: 0.25,
    realizedPnl: 0,
    valueChangePct: {
      "7D": null,
      "1M": null,
      "3M": null,
      "6M": null,
      "1Y": null,
      MAX: null,
    },
    signal: "Insufficient data",
    priceStatus: "ok",
    lastPricedAt: "2026-08-15",
    portfolioShare: 0.1,
    trackedAth: null,
    trackedAthDate: null,
    drawdownFromAthPct: null,
    ...partial,
  }
}

describe("rollupHoldingPeriod", () => {
  it("value-weights ages and sums approaching-1yr lots", () => {
    const rollup = rollupHoldingPeriod([
      pos({
        productId: "a",
        marketValue: 300,
        holdingPeriod: {
          valueWeightedAgeDays: 100,
          oldestOpenLotDate: "2026-01-01",
          oldestOpenLotAgeDays: 100,
          lotsApproachingOneYear: 1,
        },
      }),
      pos({
        productId: "b",
        marketValue: 100,
        holdingPeriod: {
          valueWeightedAgeDays: 200,
          oldestOpenLotDate: "2025-09-01",
          oldestOpenLotAgeDays: 350,
          lotsApproachingOneYear: 2,
        },
      }),
    ])
    expect(rollup.valueWeightedAgeDays).toBe(125)
    expect(rollup.oldestOpenLotAgeDays).toBe(350)
    expect(rollup.oldestOpenLotDate).toBe("2025-09-01")
    expect(rollup.lotsApproachingOneYear).toBe(3)
  })

  it("returns null age when nothing is priced", () => {
    const rollup = rollupHoldingPeriod([
      pos({
        productId: "u",
        marketValue: 0,
        holdingPeriod: {
          valueWeightedAgeDays: null,
          oldestOpenLotDate: "2026-06-01",
          oldestOpenLotAgeDays: 75,
          lotsApproachingOneYear: 0,
        },
      }),
    ])
    expect(rollup.valueWeightedAgeDays).toBeNull()
    expect(rollup.oldestOpenLotAgeDays).toBe(75)
  })
})

describe("formatAgeDays", () => {
  it("never renders null as 0d", () => {
    expect(formatAgeDays(null)).toBe("—")
    expect(formatAgeDays(10)).toBe("10d")
  })
})
