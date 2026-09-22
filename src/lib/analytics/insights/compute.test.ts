import { describe, expect, it } from "vitest"
import type { Position } from "@/lib/dashboard/contract"
import { computeInsightTransitions } from "./compute"

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
  valueChangePct: { "7D": -0.1, "1M": -0.2, "3M": 0, "6M": 0, "1Y": 0, MAX: 0 },
  signal: "Declining",
  priceStatus: "ok",
  lastPricedAt: "2026-08-16",
  portfolioShare: 0.25,
  holdingPeriod: {
    valueWeightedAgeDays: 1,
    oldestOpenLotDate: "2026-08-15",
    oldestOpenLotAgeDays: 1,
    lotsApproachingOneYear: 0,
  },
  trackedAth: 15_000,
  trackedAthDate: "2026-07-01",
  drawdownFromAthPct: -1 / 3,
}

describe("computeInsightTransitions", () => {
  it("returns deterministic events and next state without persistence", () => {
    const result = computeInsightTransitions({
      snapshotId: "snapshot-1",
      positions: [position],
      at: "2026-08-16T12:00:00Z",
      previousStates: [{
        productId: "product-1",
        lastSignal: "Cooling",
        lastOutsizedMoveState: "NORMAL",
        lastConcentrationState: false,
        lastDrawdownState: false,
        updatedAt: "2026-08-15T12:00:00Z",
      }],
    })

    expect(result.events.map((event) => event.type)).toEqual([
      "signal_transition",
      "outsized_move",
      "concentration",
      "drawdown",
    ])
    expect(result.events[0]).toMatchObject({
      entityId: "product-1",
      dedupeKey: "product-1:signal_transition:Cooling->Declining:2026-08-15T12:00:00Z",
      payload: { category: "needs_attention", headline: "Cooling → Declining" },
    })
    expect(result.states[0]).toMatchObject({
      lastSignal: "Declining",
      lastOutsizedMoveState: "OUTSIZED_DOWN",
      lastConcentrationState: true,
      lastDrawdownState: true,
    })
  })

  it("returns resolutions when persistent conditions clear", () => {
    const result = computeInsightTransitions({
      snapshotId: "snapshot-2",
      positions: [{
        ...position,
        portfolioShare: 0.1,
        trackedAth: 10_000,
        drawdownFromAthPct: 0,
        valueChangePct: { ...position.valueChangePct, "1M": 0 },
      }],
      at: "2026-08-17T12:00:00Z",
      previousStates: [{
        productId: "product-1",
        lastSignal: "Declining",
        lastOutsizedMoveState: "OUTSIZED_DOWN",
        lastConcentrationState: true,
        lastDrawdownState: true,
      }],
    })

    expect(result.resolutions).toEqual([
      { entityId: "product-1", type: "concentration" },
      { entityId: "product-1", type: "drawdown" },
    ])
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ type: "outsized_move", state: "resolved" })
  })
})
