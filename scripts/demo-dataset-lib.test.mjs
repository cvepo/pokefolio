import { describe, expect, it } from "vitest"
import { assertTargetShape, buildPriceSeries } from "./demo-dataset-lib.mjs"

describe("demo dataset generator helpers", () => {
  it("sorts price history into product series", () => {
    const series = buildPriceSeries([
      { product_id: "b", snapshot_date: "2026-01-02", price: "20.00" },
      { product_id: "a", snapshot_date: "2026-01-03", price: 12 },
      { product_id: "a", snapshot_date: "2026-01-01", price: 10 },
    ])
    expect(series.get("a")).toEqual([
      { date: "2026-01-01", price: 10 },
      { date: "2026-01-03", price: 12 },
    ])
  })

  it("accepts the agreed portfolio target shape", () => {
    expect(() => assertTargetShape({
      totalValue: 4_800,
      costBasis: 3_900,
      unrealizedPnlPct: 900 / 3_900,
      positionCount: 14,
      sellCount: 3,
      realizedPnl: 75,
      setCount: 6,
      distinctBuyDates: 10,
      winners: 8,
      losers: 6,
      approachingOneYear: 1,
      monthChangeMin: -0.18,
      monthChangeMax: 0.41,
    })).not.toThrow()
  })
})
