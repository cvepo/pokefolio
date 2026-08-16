import { describe, expect, it } from "vitest"
import { replayHoldings } from "@/lib/holdings"
import type { Product, Transaction } from "@/lib/supabase"
import { buildActivity } from "./activity"

const product: Product = {
  id: "product-1",
  name: "Test Booster Box",
  set_id: "set-1",
  set_name: "Test Set",
  tcgplayer_id: null,
  variant_id: "variant-1",
  current_price: 25,
  last_synced_at: "2026-01-04T09:00:00.000Z",
}

function transaction(
  id: string,
  type: Transaction["type"],
  quantity: number,
  price: number,
  date: string
): Transaction & { product: Product } {
  return {
    id,
    portfolio_id: "portfolio-1",
    product_id: product.id,
    type,
    quantity,
    price,
    transaction_date: date,
    notes: null,
    created_at: `${date}T12:00:00.000Z`,
    product,
  }
}

describe("buildActivity", () => {
  it("reports each sell's own FIFO realized P/L", () => {
    const transactions = [
      transaction("buy-1", "buy", 10, 10, "2026-01-01"),
      transaction("buy-2", "buy", 5, 20, "2026-01-02"),
      transaction("sell-1", "sell", 12, 25, "2026-01-03"),
      transaction("sell-2", "sell", 3, 15, "2026-01-04"),
    ]
    const replayByProduct = new Map([
      [product.id, replayHoldings(transactions)],
    ])

    const activity = buildActivity(
      transactions,
      new Map([["portfolio-1", "Main Portfolio"]]),
      replayByProduct
    )
    const sellRows = activity.items.filter((item) => item.type === "sell")

    expect(sellRows.map((item) => [item.transactionId, item.realizedPnl])).toEqual([
      ["sell-2", -1_500],
      ["sell-1", 16_000],
    ])
  })
})
