import { describe, expect, it } from "vitest"
import { buildPriceIndex } from "@/lib/price-lookup"
import type { Product, Transaction } from "@/lib/supabase"
import { computeAnalytics } from "./compute"

const products: Product[] = [
  {
    id: "a",
    name: "Alpha Booster Box",
    set_id: "set-a",
    set_name: "Alpha",
    tcgplayer_id: "1",
    variant_id: "normal",
    current_price: 140,
    last_synced_at: "2026-01-31T12:00:00Z",
  },
  {
    id: "b",
    name: "Beta Elite Trainer Box",
    set_id: "set-b",
    set_name: "Beta",
    tcgplayer_id: "2",
    variant_id: "normal",
    current_price: 180,
    last_synced_at: "2026-01-31T12:00:00Z",
  },
]

const transactions: Transaction[] = [
  {
    id: "buy-a-1",
    portfolio_id: "portfolio",
    product_id: "a",
    type: "buy",
    quantity: 2,
    price: 100,
    transaction_date: "2026-01-01",
    notes: null,
    created_at: "2026-01-01T12:00:00Z",
  },
  {
    id: "buy-b",
    portfolio_id: "portfolio",
    product_id: "b",
    type: "buy",
    quantity: 1,
    price: 200,
    transaction_date: "2026-01-05",
    notes: null,
    created_at: "2026-01-05T12:00:00Z",
  },
  {
    id: "buy-a-2",
    portfolio_id: "portfolio",
    product_id: "a",
    type: "buy",
    quantity: 1,
    price: 120,
    transaction_date: "2026-01-10",
    notes: null,
    created_at: "2026-01-10T12:00:00Z",
  },
  {
    id: "sell-a",
    portfolio_id: "portfolio",
    product_id: "a",
    type: "sell",
    quantity: 1,
    price: 150,
    transaction_date: "2026-01-20",
    notes: "Partial FIFO sale",
    created_at: "2026-01-20T12:00:00Z",
  },
]

describe("computeAnalytics", () => {
  it("computes the production payload from in-memory inputs", () => {
    const result = computeAnalytics({
      today: "2026-01-31",
      transactions,
      products,
      portfolios: [{ id: "portfolio", name: "Test Portfolio" }],
      priceIndex: buildPriceIndex([
        { product_id: "a", snapshot_date: "2026-01-01", price: 100 },
        { product_id: "a", snapshot_date: "2026-01-10", price: 120 },
        { product_id: "a", snapshot_date: "2026-01-31", price: 140 },
        { product_id: "b", snapshot_date: "2026-01-10", price: 190 },
        { product_id: "b", snapshot_date: "2026-01-31", price: 180 },
      ]),
      expectedSyncWindowDays: 7,
    })

    expect(result.summary).toEqual({
      totalValue: 46_000,
      costBasis: 42_000,
      unrealizedPnl: 4_000,
      unrealizedPnlPct: 4_000 / 42_000,
      realizedPnl: 5_000,
      netCashFlow: -37_000,
      totalInvested: 52_000,
      totalProceeds: 15_000,
      positionCount: 2,
      unitCount: 3,
      pricedPositionCount: 2,
      stalePositionCount: 0,
      unknownPositionCount: 0,
    })
    expect(result.positions.map((position) => ({
      id: position.productId,
      quantity: position.quantity,
      costBasis: position.costBasis,
      marketValue: position.marketValue,
      realizedPnl: position.realizedPnl,
    }))).toEqual([
      { id: "a", quantity: 2, costBasis: 22_000, marketValue: 28_000, realizedPnl: 5_000 },
      { id: "b", quantity: 1, costBasis: 20_000, marketValue: 18_000, realizedPnl: 0 },
    ])
    expect(
      result.performance.seriesByTimeframe.MAX.find((point) => point.date === "2026-01-05")
    ).toMatchObject({ actual: 40_000, actualBasis: "partial" })
    expect(result.activity.items[0]).toMatchObject({
      transactionId: "sell-a",
      realizedPnl: 5_000,
    })
  })
})
