import { describe, expect, it } from "vitest"
import type { DemoDataset } from "./contract"
import { createDemoStore } from "./store-core"

const portfolioId = "00000000-0000-4000-8000-000000000001"

function fixture(): DemoDataset {
  return {
    asOf: "2026-09-22",
    portfolios: [{
      id: portfolioId,
      name: "Demo Collection",
      description: null,
      created_at: "2026-01-01T12:00:00.000Z",
    }],
    catalog: [
      {
        id: "alpha",
        name: "Alpha Booster Box",
        set_id: "set-a",
        set_name: "Alpha Set",
        tcgplayer_id: "1",
        variant_id: "normal",
        current_price: 130,
      },
      {
        id: "beta",
        name: "Beta Elite Trainer Box",
        set_id: "set-b",
        set_name: "Beta Set",
        tcgplayer_id: "2",
        variant_id: "normal",
        current_price: 80,
      },
    ],
    priceHistory: [
      {
        productId: "alpha",
        dates: ["2026-08-20", "2026-09-15", "2026-09-22"],
        prices: [100, 120, 130],
      },
      {
        productId: "beta",
        dates: ["2026-08-20", "2026-09-15", "2026-09-22"],
        prices: [90, 85, 80],
      },
    ],
    transactions: [{
      id: "seed-buy",
      portfolio_id: portfolioId,
      product_id: "alpha",
      type: "buy",
      quantity: 1,
      price: 100,
      transaction_date: "2026-08-20",
      notes: null,
      created_at: "2026-08-20T12:00:00.000Z",
    }],
  }
}

describe("createDemoStore", () => {
  it("uses the frozen date and computes the dashboard in memory", () => {
    const store = createDemoStore(fixture(), { storage: null })
    const dashboard = store.getDashboard(undefined, "1M")

    expect(store.today).toBe("2026-09-22")
    expect(dashboard.asOf).toBe("2026-09-22T12:00:00.000Z")
    expect(dashboard.data.summary).toMatchObject({
      totalValue: 13_000,
      costBasis: 10_000,
      unrealizedPnl: 3_000,
      positionCount: 1,
    })
  })

  it("searches names and sets without case sensitivity", () => {
    const store = createDemoStore(fixture(), { storage: null })

    expect(store.searchProducts("booster").map((product) => product.id)).toEqual(["alpha"])
    expect(store.searchProducts("BETA SET").map((product) => product.id)).toEqual(["beta"])
    expect(store.getProduct("missing")).toBeNull()
  })
})
