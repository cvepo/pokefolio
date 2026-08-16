import { describe, expect, it } from "vitest"
import { computeHoldingPeriod } from "./holding-period"

describe("holding period", () => {
  it("weights open FIFO lots by their current value", () => {
    const result = computeHoldingPeriod([
      { buyTransactionId: "old", buyDate: "2025-01-01", buyPrice: 10, remaining: 1 },
      { buyTransactionId: "new", buyDate: "2025-12-22", buyPrice: 20, remaining: 9 },
    ], 50, "2026-01-01")
    expect(result.valueWeightedAgeDays).toBeCloseTo(45.5)
    expect(result.oldestOpenLotAgeDays).toBe(365)
  })

  it("counts lots in the inclusive 335 to 364 day window", () => {
    const result = computeHoldingPeriod([
      { buyTransactionId: "a", buyDate: "2025-01-02", buyPrice: 1, remaining: 1 },
      { buyTransactionId: "b", buyDate: "2025-01-31", buyPrice: 1, remaining: 1 },
      { buyTransactionId: "c", buyDate: "2025-02-01", buyPrice: 1, remaining: 1 },
    ], 2, "2026-01-01")
    expect(result.lotsApproachingOneYear).toBe(2)
  })

  it("preserves dates but reports unknown weighted age without a price", () => {
    expect(computeHoldingPeriod([
      { buyTransactionId: "a", buyDate: "2025-01-01", buyPrice: 1, remaining: 1 },
    ], null, "2026-01-01").valueWeightedAgeDays).toBeNull()
  })
})
