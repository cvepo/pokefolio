import { describe, expect, it } from "vitest"
import type { Transaction } from "@/lib/supabase"
import {
  computeHoldings,
  computeHoldingsAsOf,
  holdingStateByDate,
  replayHoldings,
} from "./holdings"

function transaction(
  id: string,
  type: Transaction["type"],
  quantity: number,
  price: number,
  date: string
): Transaction {
  return {
    id,
    portfolio_id: "portfolio-1",
    product_id: "product-1",
    type,
    quantity,
    price,
    transaction_date: date,
    notes: null,
    created_at: `${date}T12:00:00.000Z`,
  }
}

describe("replayHoldings", () => {
  const transactions = [
    transaction("buy-1", "buy", 10, 10, "2026-01-01"),
    transaction("buy-2", "buy", 5, 20, "2026-01-02"),
    transaction("sell-1", "sell", 12, 25, "2026-01-03"),
    transaction("sell-2", "sell", 3, 15, "2026-01-04"),
  ]

  it("preserves the existing aggregate holdings result", () => {
    const replay = replayHoldings(transactions)

    expect(replay.holdings).toEqual(computeHoldings(transactions))
    expect(replay.holdings).toMatchObject({
      netQty: 0,
      totalBuyQty: 15,
      totalSellQty: 15,
      totalInvested: 200,
      totalProceeds: 345,
      costBasisRemaining: 0,
      realizedPnL: 145,
      profitableSells: 1,
      totalSells: 2,
    })
  })

  it("exposes the quantity and FIFO result of each transaction", () => {
    expect(replayHoldings(transactions).transactions).toEqual([
      {
        transactionId: "buy-1",
        transactionDate: "2026-01-01",
        netQty: 10,
        realizedPnl: null,
        costBasisRemaining: 100,
      },
      {
        transactionId: "buy-2",
        transactionDate: "2026-01-02",
        netQty: 15,
        realizedPnl: null,
        costBasisRemaining: 200,
      },
      {
        transactionId: "sell-1",
        transactionDate: "2026-01-03",
        netQty: 3,
        realizedPnl: 160,
        costBasisRemaining: 60,
      },
      {
        transactionId: "sell-2",
        transactionDate: "2026-01-04",
        netQty: 0,
        realizedPnl: -15,
        costBasisRemaining: 0,
      },
    ])
  })

  it("carries net quantity across dates with one transaction replay", () => {
    const dates = [
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]
    const replay = replayHoldings([...transactions].reverse())
    const states = holdingStateByDate(replay.transactions, dates)

    expect([...states.values()].map((state) => state.netQty)).toEqual([0, 10, 15, 3, 0, 0])

    // Carrying state forward must agree with replaying history per date, for
    // cost basis as well as quantity — the chart's pre-tracking fallback
    // depends on the cost figure being right, not just the quantity.
    for (const date of dates) {
      const expected = computeHoldingsAsOf(transactions, date)
      expect(states.get(date)!.netQty).toBe(expected.netQty)
      expect(states.get(date)!.costBasisRemaining).toBeCloseTo(expected.costBasisRemaining, 6)
      expect(states.get(date)!.avgCostRemaining).toBeCloseTo(expected.avgCostRemaining, 6)
    }
  })
})
