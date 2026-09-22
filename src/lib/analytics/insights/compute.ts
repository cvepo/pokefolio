import type {
  InsightCategory,
  InsightPayload,
  InsightState,
  InsightType,
  Position,
  PositionSignal,
} from "@/lib/dashboard/contract"
import { concentrationTransition } from "./concentration"
import { drawdownTransition } from "./drawdown"
import {
  outsizedMoveState,
  outsizedMoveTransition,
  type OutsizedMoveState,
} from "./outsized-move"
import { insightSeverity } from "./severity"
import { signalTransition } from "./signal-transition"

export type InsightPositionState = {
  productId: string
  lastSignal: PositionSignal | null
  lastOutsizedMoveState: OutsizedMoveState
  lastConcentrationState: boolean | null
  lastDrawdownState: boolean | null
  updatedAt?: string
}

export type ComputedInsightEvent = {
  type: InsightType
  entityId: string
  state: InsightState
  severity: number
  triggeredAt: string
  resolvedAt: string | null
  snapshotId: string
  dedupeKey: string
  payload: InsightPayload & { category: InsightCategory; headline: string }
}

export type InsightComputation = {
  events: ComputedInsightEvent[]
  states: InsightPositionState[]
  resolutions: Array<{ entityId: string; type: "concentration" | "drawdown" }>
}

function transitionIdentity(payload: InsightPayload, resolved: boolean): string {
  switch (payload.kind) {
    case "signal_transition":
      return `${payload.fromSignal}->${payload.toSignal}`
    case "outsized_move":
      return `${payload.fromState}->${payload.toState}`
    case "concentration":
    case "drawdown":
      return resolved ? "true->false" : "false->true"
  }
}

function insightDedupeKey(
  position: Position,
  type: InsightType,
  payload: InsightPayload,
  resolved: boolean,
  previousStateAt: string | undefined
): string {
  return [
    position.productId,
    type,
    transitionIdentity(payload, resolved),
    previousStateAt ?? "initial",
  ].join(":")
}

/** Pure state-machine evaluation; persistence is deliberately handled elsewhere. */
export function computeInsightTransitions(input: {
  snapshotId: string
  positions: Position[]
  at: string
  previousStates: InsightPositionState[]
}): InsightComputation {
  const previousById = new Map(input.previousStates.map((state) => [state.productId, state]))
  const events: ComputedInsightEvent[] = []
  const states: InsightPositionState[] = []
  const resolutions: InsightComputation["resolutions"] = []

  for (const position of input.positions) {
    const previous = previousById.get(position.productId)
    const signal = signalTransition(previous?.lastSignal ?? null, position.signal)
    const move = outsizedMoveTransition(
      previous?.lastOutsizedMoveState ?? "NORMAL",
      position.valueChangePct["1M"]
    )
    const concentration = concentrationTransition(
      previous?.lastConcentrationState ?? null,
      position.portfolioShare
    )
    const drawdown = drawdownTransition({
      wasInDrawdown: previous?.lastDrawdownState ?? null,
      drawdownPct: position.drawdownFromAthPct,
      trackedAth: position.trackedAth == null ? null : position.trackedAth / 100,
      trackedAthDate: position.trackedAthDate,
    })

    const add = (
      type: InsightType,
      payload: InsightPayload,
      category: InsightCategory,
      headline: string,
      state: InsightState = "active"
    ) => {
      const resolved = state === "resolved"
      events.push({
        type,
        entityId: position.productId,
        state,
        severity: insightSeverity(payload),
        triggeredAt: input.at,
        resolvedAt: resolved ? input.at : null,
        snapshotId: input.snapshotId,
        dedupeKey: insightDedupeKey(
          position,
          type,
          payload,
          resolved,
          previous?.updatedAt
        ),
        payload: { ...payload, category, headline },
      })
    }

    if (signal) {
      add(
        "signal_transition",
        signal,
        signal.toSignal === "Declining" || signal.toSignal === "Cooling"
          ? "needs_attention"
          : "signal_change",
        `${signal.fromSignal} → ${signal.toSignal}`
      )
    }

    if (move) {
      add(
        "outsized_move",
        move,
        move.direction === "down" ? "needs_attention" : "positive",
        `${move.direction === "down" ? "Down" : "Up"} ${(Math.abs(move.movePct) * 100).toFixed(1)}% (1M)`,
        move.toState === "NORMAL" ? "resolved" : "active"
      )
    }

    if (concentration) {
      if (concentration.resolved) {
        resolutions.push({ entityId: position.productId, type: "concentration" })
      } else {
        add(
          "concentration",
          concentration.payload,
          "needs_attention",
          `Concentration: ${(position.portfolioShare * 100).toFixed(1)}% of portfolio`
        )
      }
    }

    if (drawdown) {
      if (drawdown.resolved) {
        resolutions.push({ entityId: position.productId, type: "drawdown" })
      } else {
        add(
          "drawdown",
          drawdown.payload,
          "needs_attention",
          `${(Math.abs(drawdown.payload.drawdownPct) * 100).toFixed(1)}% below Tracked ATH`
        )
      }
    }

    states.push({
      productId: position.productId,
      lastSignal: position.signal,
      lastOutsizedMoveState: outsizedMoveState(position.valueChangePct["1M"]),
      lastConcentrationState: position.portfolioShare >= 0.2,
      lastDrawdownState:
        position.drawdownFromAthPct != null && position.drawdownFromAthPct <= -0.15,
      updatedAt: input.at,
    })
  }

  return { events, states, resolutions }
}
