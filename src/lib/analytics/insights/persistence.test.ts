import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Position } from "@/lib/dashboard/contract"

const database = vi.hoisted(() => ({
  stateRows: [] as Array<Record<string, unknown>>,
  eventsByKey: new Map<string, Record<string, unknown>>(),
  attemptedKeys: [] as string[],
}))

vi.mock("@/lib/supabase-server", () => ({
  supabase: {
    from(table: string) {
      if (table === "position_signal_state") {
        return {
          select: () => ({
            in: async () => ({ data: database.stateRows }),
          }),
          upsert: async () => ({ error: null }),
        }
      }

      if (table === "insight_events") {
        return {
          upsert: (rows: Array<Record<string, unknown>>) => ({
            select: async () => {
              const inserted: Array<{ id: string }> = []
              for (const row of rows) {
                const key = String(row.dedupe_key)
                database.attemptedKeys.push(key)
                if (database.eventsByKey.has(key)) continue
                database.eventsByKey.set(key, row)
                inserted.push({ id: `event-${inserted.length + 1}` })
              }
              return { data: inserted, error: null }
            },
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

import { persistInsightTransitions } from "./persistence"

const position: Position = {
  productId: "product-1",
  name: "Test Booster Box",
  setId: "set-1",
  setName: "Test Set",
  tcgplayerId: null,
  category: "Booster Box",
  categorySource: "inferred",
  quantity: 1,
  currentUnitPrice: 10_000,
  marketValue: 10_000,
  costBasis: 8_000,
  avgUnitCost: 8_000,
  unrealizedPnl: 2_000,
  unrealizedPnlPct: 0.25,
  realizedPnl: 0,
  valueChangePct: {
    "7D": 0,
    "1M": 0,
    "3M": 0,
    "6M": 0,
    "1Y": 0,
    MAX: 0,
  },
  signal: "Declining",
  priceStatus: "ok",
  lastPricedAt: "2026-08-16",
  portfolioShare: 0.1,
  holdingPeriod: {
    valueWeightedAgeDays: 1,
    oldestOpenLotDate: "2026-08-15",
    oldestOpenLotAgeDays: 1,
    lotsApproachingOneYear: 0,
  },
  trackedAth: null,
  trackedAthDate: null,
  drawdownFromAthPct: null,
}

describe("persistInsightTransitions", () => {
  beforeEach(() => {
    database.eventsByKey.clear()
    database.attemptedKeys.length = 0
    database.stateRows = [
      {
        product_id: "product-1",
        last_signal: "Cooling",
        last_outsized_move_state: "NORMAL",
        last_concentration_state: false,
        last_drawdown_state: false,
        updated_at: "2026-08-15T09:00:00.000Z",
      },
    ]
  })

  it("inserts nothing when an identical transition reruns after state is reset", async () => {
    const first = await persistInsightTransitions(
      "snapshot-1",
      [position],
      "2026-08-16T09:00:00.000Z"
    )

    // Leave the mock state at its pre-transition value to simulate an
    // accidental reset before the retry.
    const second = await persistInsightTransitions(
      "snapshot-2",
      [position],
      "2026-08-17T09:00:00.000Z"
    )

    expect(first).toBe(1)
    expect(second).toBe(0)
    expect(database.eventsByKey).toHaveLength(1)
    expect(database.attemptedKeys[0]).toBe(database.attemptedKeys[1])
    expect(database.attemptedKeys[0]).not.toContain("snapshot-1")
    expect(database.attemptedKeys[0]).not.toContain("snapshot-2")
  })
})
