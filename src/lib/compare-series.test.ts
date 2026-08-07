import { describe, expect, it } from "vitest"
import { computeHoldings } from "@/lib/holdings"
import { buildPriceIndex, priceOnOrBefore } from "@/lib/price-lookup"
import type { Transaction } from "@/lib/supabase"
import {
  buildComparePriceIndex,
  buildComparisonSeries,
  classifyExitReviewSignal,
  computeFilledRanges,
  computeMomentum7d,
  computeRowMetrics,
  daysBetween,
  parseLocalDate,
  positionPctEqualsPerUnitPct,
  resolveAnchor,
  sanitizeHistory,
  type CompareProduct,
} from "@/lib/compare-series"

function product(
  id: string,
  history: Array<[string, number | string]>,
  opts: Partial<Omit<CompareProduct, "product_id" | "history">> = {}
): CompareProduct {
  const sanitized = sanitizeHistory(history)
  const last = sanitized.length ? sanitized[sanitized.length - 1] : null
  return {
    product_id: id,
    name: opts.name ?? id,
    set_name: opts.set_name ?? "Set",
    tcgplayer_id: opts.tcgplayer_id ?? null,
    qty: opts.qty ?? 1,
    avg_cost: opts.avg_cost ?? 50,
    current_price: opts.current_price ?? last?.[1] ?? 0,
    current_price_source:
      opts.current_price_source ?? (sanitized.length ? "snapshot" : "products_fallback"),
    last_snapshot_date: opts.last_snapshot_date ?? last?.[0] ?? null,
    history: sanitized,
  }
}

describe("anchoring", () => {
  it("1. uses snapshot exactly on windowStart", () => {
    const p = product("a", [
      ["2026-01-01", 100],
      ["2026-02-01", 110],
      ["2026-03-01", 120],
    ])
    const idx = buildComparePriceIndex([p])
    const anchor = resolveAnchor(idx, "a", "2026-02-01")
    expect(anchor).toEqual({
      date: "2026-02-01",
      price: 110,
      ageDays: 0,
      stale: false,
    })
  })

  it("2. uses most recent prior when only older snapshots exist", () => {
    const p = product("a", [
      ["2026-01-01", 100],
      ["2026-01-15", 105],
    ])
    const idx = buildComparePriceIndex([p])
    const anchor = resolveAnchor(idx, "a", "2026-02-01")
    expect(anchor?.price).toBe(105)
    expect(anchor?.date).toBe("2026-02-01")
    expect(anchor?.ageDays).toBe(daysBetween("2026-01-15", "2026-02-01"))
  })

  it("3. anchors at first snapshot when product appears mid-window", () => {
    const p = product("a", [
      ["2026-02-15", 80],
      ["2026-03-01", 90],
    ])
    const idx = buildComparePriceIndex([p])
    const anchor = resolveAnchor(idx, "a", "2026-02-01")
    expect(anchor).toEqual({
      date: "2026-02-15",
      price: 80,
      ageDays: 0,
      stale: false,
    })
  })

  it("4. renders no value before the product's anchor date", () => {
    const p = product("a", [
      ["2026-02-15", 80],
      ["2026-02-20", 88],
    ])
    const { rows, anchors } = buildComparisonSeries({
      products: [p],
      selectedIds: ["a"],
      windowStart: "2026-02-01",
      windowEnd: "2026-02-20",
      view: "per_unit_pct",
    })
    expect(anchors.a.date).toBe("2026-02-15")
    for (const row of rows) {
      if (String(row.date) < "2026-02-15") {
        expect(row.a).toBeNull()
        expect(row.a__dashed).toBeNull()
      }
    }
    const onAnchor = rows.find((r) => r.date === "2026-02-15")
    expect(onAnchor?.a).toBe(0)
  })

  it("5. flags stale anchors (>7d) without substituting a later price", () => {
    const p = product("a", [
      ["2026-01-01", 100],
      ["2026-02-20", 150],
    ])
    const idx = buildComparePriceIndex([p])
    const anchor = resolveAnchor(idx, "a", "2026-02-01")
    expect(anchor?.price).toBe(100) // prior, not the later 150
    expect(anchor?.stale).toBe(true)
    expect(anchor!.ageDays).toBeGreaterThan(7)
  })

  it("6. excludes zero and null anchor prices", () => {
    const zero = product("z", [
      ["2026-01-01", 0],
      ["2026-02-01", 10],
    ])
    // 0 is stripped by sanitize → only Feb remains; mid-window anchor at Feb
    const idx = buildComparePriceIndex([zero])
    // Force a zero into the index to simulate a bad row that slipped through
    idx.bad = [{ date: "2026-01-01", price: 0 }]
    expect(resolveAnchor(idx, "bad", "2026-02-01")).toBeNull()

    const empty = product("e", [])
    const idx2 = buildComparePriceIndex([empty])
    expect(resolveAnchor(idx2, "e", "2026-02-01")).toBeNull()

    const { excludedIds } = buildComparisonSeries({
      products: [empty],
      selectedIds: ["e"],
      windowStart: "2026-02-01",
      windowEnd: "2026-02-10",
      view: "per_unit_pct",
    })
    expect(excludedIds).toContain("e")
  })
})

describe("forward-fill", () => {
  it("7. missing dates forward-fill from the last known price", () => {
    const p = product("a", [
      ["2026-02-01", 100],
      ["2026-02-05", 110],
    ])
    const idx = buildComparePriceIndex([p])
    expect(priceOnOrBefore(idx, "a", "2026-02-03")).toBe(100)
    expect(priceOnOrBefore(idx, "a", "2026-02-05")).toBe(110)

    const { rows } = buildComparisonSeries({
      products: [p],
      selectedIds: ["a"],
      windowStart: "2026-02-01",
      windowEnd: "2026-02-05",
      view: "per_unit_pct",
      priceIndex: idx,
    })
    const feb3 = rows.find((r) => r.date === "2026-02-03")
    // forward-filled at 100 → 0%
    const v = feb3?.a ?? feb3?.a__dashed
    expect(v).toBe(0)
  })

  it("8. reports forward-filled runs longer than 7 days in filledRanges", () => {
    const p = product("a", [
      ["2026-02-01", 100],
      ["2026-02-20", 120],
    ])
    const idx = buildComparePriceIndex([p])
    const ranges = computeFilledRanges(idx, "a", "2026-02-01", "2026-02-20")
    expect(ranges.length).toBeGreaterThan(0)
    // Feb 2–19 is 18 days of fill
    expect(ranges.some(([a, b]) => daysBetween(a, b) >= 7)).toBe(true)

    const { filledRanges } = buildComparisonSeries({
      products: [p],
      selectedIds: ["a"],
      windowStart: "2026-02-01",
      windowEnd: "2026-02-20",
      view: "per_unit_pct",
      priceIndex: idx,
    })
    expect(filledRanges.a.length).toBeGreaterThan(0)
  })

  it("9. as_of_date is the global max of last snapshot dates", () => {
    const products = [
      product("a", [
        ["2026-01-01", 10],
        ["2026-03-01", 12],
      ]),
      product("b", [
        ["2026-01-01", 20],
        ["2026-04-15", 22],
      ]),
      product("c", [["2026-02-01", 30]]),
    ]
    const asOf = products.reduce((max, p) => {
      const last = p.last_snapshot_date
      return last && last > max ? last : max
    }, "")
    expect(asOf).toBe("2026-04-15")
  })
})

describe("view math", () => {
  it("10. Position % equals Per-unit % (qty cancels)", () => {
    expect(positionPctEqualsPerUnitPct(120, 100)).toBe(true)
    expect(positionPctEqualsPerUnitPct(80, 100)).toBe(true)
  })

  it("11. Combined % is value-weighted, not an unweighted mean", () => {
    // Cheap tin: qty 100 @ $8 → $800; expensive case: qty 1 @ $2000
    // Tin +10%, case 0% → unweighted mean = 5%; value-weighted ≈ 800/2800 * 10 ≈ 2.86%
    const tin = product(
      "tin",
      [
        ["2026-02-01", 8],
        ["2026-03-01", 8.8],
      ],
      { qty: 100 }
    )
    const box = product(
      "box",
      [
        ["2026-02-01", 2000],
        ["2026-03-01", 2000],
      ],
      { qty: 1 }
    )
    const { rows } = buildComparisonSeries({
      products: [tin, box],
      selectedIds: ["tin", "box"],
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      view: "combined_pct",
    })
    const last = rows[rows.length - 1]
    const combined = Number(last.combined)
    const unweighted = (10 + 0) / 2
    expect(combined).toBeCloseTo((80 / 2800) * 100, 5) // +$80 on $2800
    expect(Math.abs(combined - unweighted)).toBeGreaterThan(1)
  })

  it("12. Combined uses basketAnchorDate = max(anchorDate) across selection", () => {
    const early = product("early", [
      ["2026-01-01", 100],
      ["2026-03-01", 110],
    ])
    const late = product("late", [
      ["2026-02-15", 50],
      ["2026-03-01", 55],
    ])
    const { basketAnchorDate, rows } = buildComparisonSeries({
      products: [early, late],
      selectedIds: ["early", "late"],
      windowStart: "2026-01-01",
      windowEnd: "2026-03-01",
      view: "combined_pct",
    })
    expect(basketAnchorDate).toBe("2026-02-15")
    expect(rows[0]?.date).toBe("2026-02-15")
    expect(Number(rows[0]?.combined)).toBe(0)
  })

  it("13. Single-product Combined matches that product's individual line", () => {
    const p = product(
      "solo",
      [
        ["2026-02-01", 100],
        ["2026-02-15", 110],
        ["2026-03-01", 120],
      ],
      { qty: 3 }
    )
    const individual = buildComparisonSeries({
      products: [p],
      selectedIds: ["solo"],
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      view: "per_unit_pct",
    })
    const combined = buildComparisonSeries({
      products: [p],
      selectedIds: ["solo"],
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      view: "combined_pct",
    })
    expect(combined.basketAnchorDate).toBe(individual.anchors.solo.date)
    for (const row of combined.rows) {
      const ind = individual.rows.find((r) => r.date === row.date)
      const indVal = ind?.solo ?? ind?.solo__dashed
      expect(Number(row.combined)).toBeCloseTo(Number(indVal), 8)
    }
  })
})

describe("metrics", () => {
  it("15. returnContribution stays stable when naive ratio explodes", () => {
    const a = product(
      "a",
      [
        ["2026-02-01", 100],
        ["2026-03-01", 150],
      ],
      { qty: 10 }
    ) // +$500
    const b = product(
      "b",
      [
        ["2026-02-01", 100],
        ["2026-03-01", 51],
      ],
      { qty: 10 }
    ) // −$490
    const rows = computeRowMetrics({
      products: [a, b],
      selectedIds: ["a", "b"],
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      totalStartingPortfolioValue: 0, // force anchor-based denom = 2000
    })
    const rowA = rows.find((r) => r.product_id === "a")!
    // Naive: 500 / 10 = 5000%. Stable: 500 / 2000 = 25%.
    expect(rowA.returnContribution).toBeCloseTo(25, 5)
    expect(rowA.returnContribution!).toBeLessThan(100)
  })

  it("16. movementShare sums to 100% across all held products", () => {
    const products = [
      product("a", [
        ["2026-02-01", 100],
        ["2026-03-01", 150],
      ], { qty: 2 }),
      product("b", [
        ["2026-02-01", 50],
        ["2026-03-01", 40],
      ], { qty: 4 }),
      product("c", [
        ["2026-02-01", 20],
        ["2026-03-01", 20],
      ], { qty: 1 }),
    ]
    const rows = computeRowMetrics({
      products,
      selectedIds: products.map((p) => p.product_id),
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      totalStartingPortfolioValue: 0,
    })
    const sum = rows.reduce((s, r) => s + (r.movementShare ?? 0), 0)
    expect(sum).toBeCloseTo(100, 5)
  })

  it("17. 7D Δ% returns null when no real prior snapshot in lookback", () => {
    const p = product("a", [
      ["2026-01-01", 100],
      ["2026-03-01", 120], // only one point in the 7d lookback ending Mar 1
    ])
    const idx = buildComparePriceIndex([p])
    expect(computeMomentum7d(idx, "a", "2026-03-01")).toBeNull()

    const dense = product("b", [
      ["2026-02-24", 100],
      ["2026-02-28", 105],
      ["2026-03-01", 110],
    ])
    const idx2 = buildComparePriceIndex([dense])
    const m = computeMomentum7d(idx2, "b", "2026-03-01")
    expect(m).not.toBeNull()
    // Most recent two in lookback: Feb 28 → Mar 1
    expect(m).toBeCloseTo((110 / 105 - 1) * 100, 5)
  })

  it("18. Drawdown is 0 when current price is the window max", () => {
    const p = product("a", [
      ["2026-02-01", 100],
      ["2026-02-15", 90],
      ["2026-03-01", 120],
    ])
    const rows = computeRowMetrics({
      products: [p],
      selectedIds: ["a"],
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      totalStartingPortfolioValue: 0,
    })
    expect(rows[0].drawdownPct).toBeCloseTo(0, 8)
  })

  it("19. Signal classification across all five branches", () => {
    expect(
      classifyExitReviewSignal({
        windowPct: 20,
        momentum7dPct: 5,
        windowDays: 30,
        realPoints: 10,
        staleDays: 0,
      })
    ).toBe("Accelerating") // 5 > 20*(7/30)≈4.67

    expect(
      classifyExitReviewSignal({
        windowPct: 20,
        momentum7dPct: -3,
        windowDays: 30,
        realPoints: 10,
        staleDays: 0,
      })
    ).toBe("Cooling")

    // Stalled winner: up over the window, but this week's gain is positive and
    // well below the window's weekly pace (0.5 < 20*(7/30)≈4.67).
    expect(
      classifyExitReviewSignal({
        windowPct: 20,
        momentum7dPct: 0.5,
        windowDays: 30,
        realPoints: 10,
        staleDays: 0,
      })
    ).toBe("Cooling")

    expect(
      classifyExitReviewSignal({
        windowPct: -20,
        momentum7dPct: 3,
        windowDays: 30,
        realPoints: 10,
        staleDays: 0,
      })
    ).toBe("Recovering")

    expect(
      classifyExitReviewSignal({
        windowPct: -20,
        momentum7dPct: -3,
        windowDays: 30,
        realPoints: 10,
        staleDays: 0,
      })
    ).toBe("Declining")

    expect(
      classifyExitReviewSignal({
        windowPct: 20,
        momentum7dPct: 5,
        windowDays: 30,
        realPoints: 1,
        staleDays: 0,
      })
    ).toBe("Insufficient data")

    expect(
      classifyExitReviewSignal({
        windowPct: 20,
        momentum7dPct: 5,
        windowDays: 30,
        realPoints: 10,
        staleDays: 20,
      })
    ).toBe("Insufficient data")
  })
})

describe("data integrity", () => {
  it("20. timezone boundary — snapshot on windowStart is included at local midnight", () => {
    const windowStart = "2026-02-01"
    const local = parseLocalDate(windowStart)
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(1)
    expect(local.getDate()).toBe(1)
    // Must not shift to Jan 31 in negative-UTC zones
    expect(local.getHours()).toBe(0)

    const p = product("a", [
      ["2026-02-01", 100],
      ["2026-02-10", 110],
    ])
    const idx = buildComparePriceIndex([p])
    const anchor = resolveAnchor(idx, "a", windowStart)
    expect(anchor?.price).toBe(100)
    expect(anchor?.date).toBe(windowStart)
  })

  it("21. sold transactions produce the correct current FIFO quantity", () => {
    const txs: Transaction[] = [
      {
        id: "1",
        portfolio_id: "p",
        product_id: "x",
        type: "buy",
        quantity: 5,
        price: 10,
        transaction_date: "2026-01-01",
        notes: null,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        portfolio_id: "p",
        product_id: "x",
        type: "sell",
        quantity: 2,
        price: 15,
        transaction_date: "2026-01-15",
        notes: null,
        created_at: "2026-01-15T00:00:00Z",
      },
    ]
    const h = computeHoldings(txs)
    expect(h.netQty).toBe(3)
    expect(h.avgCostRemaining).toBe(10)

    const p = product(
      "x",
      [
        ["2026-02-01", 10],
        ["2026-03-01", 12],
      ],
      { qty: h.netQty, avg_cost: h.avgCostRemaining }
    )
    const rows = computeRowMetrics({
      products: [p],
      selectedIds: ["x"],
      windowStart: "2026-02-01",
      windowEnd: "2026-03-01",
      totalStartingPortfolioValue: 0,
    })
    // Δ$ = ($12−$10) × 3 = $6
    expect(rows[0].positionDelta).toBeCloseTo(6, 8)
  })

  it("22. string-typed decimal prices from Supabase coerce correctly", () => {
    const history = sanitizeHistory([
      ["2026-02-01", "61.40" as unknown as number],
      ["2026-02-02", "62.00" as unknown as number],
    ])
    expect(history[0][1]).toBe(61.4)
    expect(typeof history[0][1]).toBe("number")

    const idx = buildPriceIndex([
      { product_id: "a", price: "10.5", snapshot_date: "2026-02-01" },
    ])
    expect(priceOnOrBefore(idx, "a", "2026-02-01")).toBe(10.5)
  })
})
