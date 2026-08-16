import { describe, expect, it } from "vitest"
import { computeTrackedAth } from "./tracked-ath"

describe("Tracked ATH", () => {
  it("uses the highest recorded snapshot and computes drawdown", () => {
    expect(computeTrackedAth({ p: [
      { date: "2026-01-01", price: 100 },
      { date: "2026-02-01", price: 125 },
      { date: "2026-03-01", price: 100 },
    ] }, "p", 100)).toEqual({ price: 125, date: "2026-02-01", drawdownPct: -0.2 })
  })

  it("returns null without tracked history", () => {
    expect(computeTrackedAth({}, "p", 10)).toBeNull()
  })
})
