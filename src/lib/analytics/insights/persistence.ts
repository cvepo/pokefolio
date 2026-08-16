import type {
  InsightPayload,
  Position,
  PositionSignal,
} from "@/lib/dashboard/contract"
import { supabase } from "@/lib/supabase-server"
import { concentrationTransition } from "./concentration"
import { drawdownTransition } from "./drawdown"
import {
  outsizedMoveState,
  outsizedMoveTransition,
  type OutsizedMoveState,
} from "./outsized-move"
import { insightSeverity } from "./severity"
import { signalTransition } from "./signal-transition"

type PersistedPositionState = {
  last_signal: PositionSignal | null
  last_outsized_move_state: OutsizedMoveState
  last_concentration_state: boolean | null
  last_drawdown_state: boolean | null
  updated_at: string
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
  type: string,
  payload: InsightPayload,
  resolved: boolean,
  previousStateAt: string | undefined
): string {
  // The prior state's timestamp identifies the epoch that produced this
  // transition. A retry from the same prior state therefore collides, while a
  // genuine later re-crossing starts from a newer state epoch and remains new.
  return [
    position.productId,
    type,
    transitionIdentity(payload, resolved),
    previousStateAt ?? "initial",
  ].join(":")
}

export async function persistInsightTransitions(
  snapshotId: string,
  positions: Position[],
  at: string
): Promise<number> {
  if (!positions.length) return 0

  const ids = positions.map((position) => position.productId)
  const { data: states } = await supabase
    .from("position_signal_state")
    .select("*")
    .in("product_id", ids)
  const stateById = new Map((states ?? []).map((state) => [state.product_id, state]))
  const events: Array<Record<string, unknown>> = []

  for (const position of positions) {
    const old = stateById.get(position.productId) as PersistedPositionState | undefined
    const signal = signalTransition(old?.last_signal ?? null, position.signal)
    const move = outsizedMoveTransition(
      old?.last_outsized_move_state ?? "NORMAL",
      position.valueChangePct["1M"]
    )
    const concentration = concentrationTransition(
      old?.last_concentration_state ?? null,
      position.portfolioShare
    )
    const drawdown = drawdownTransition({
      wasInDrawdown: old?.last_drawdown_state ?? null,
      drawdownPct: position.drawdownFromAthPct,
      trackedAth: position.trackedAth == null ? null : position.trackedAth / 100,
      trackedAthDate: position.trackedAthDate,
    })

    const add = (
      type: string,
      payload: InsightPayload,
      category: string,
      headline: string,
      state = "active"
    ) => {
      const resolved = state === "resolved"
      events.push({
        type,
        entity_id: position.productId,
        state,
        severity: insightSeverity(payload),
        triggered_at: at,
        resolved_at: resolved ? at : null,
        snapshot_id: snapshotId,
        dedupe_key: insightDedupeKey(
          position,
          type,
          payload,
          resolved,
          old?.updated_at
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
        await supabase
          .from("insight_events")
          .update({ state: "resolved", resolved_at: at })
          .eq("entity_id", position.productId)
          .eq("type", "concentration")
          .eq("state", "active")
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
        await supabase
          .from("insight_events")
          .update({ state: "resolved", resolved_at: at })
          .eq("entity_id", position.productId)
          .eq("type", "drawdown")
          .eq("state", "active")
      } else {
        add(
          "drawdown",
          drawdown.payload,
          "needs_attention",
          `${(Math.abs(drawdown.payload.drawdownPct) * 100).toFixed(1)}% below Tracked ATH`
        )
      }
    }

    await supabase.from("position_signal_state").upsert({
      product_id: position.productId,
      last_signal: position.signal,
      last_outsized_move_state: outsizedMoveState(position.valueChangePct["1M"]),
      last_concentration_state: position.portfolioShare >= 0.2,
      last_drawdown_state:
        position.drawdownFromAthPct != null && position.drawdownFromAthPct <= -0.15,
      updated_at: at,
    })
  }

  if (!events.length) return 0

  // State machines provide normal idempotency. The unique key is the final
  // backstop for a reset or concurrent retry, so a collision is a successful
  // no-op rather than a failed analytics publish.
  const { data, error } = await supabase
    .from("insight_events")
    .upsert(events, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id")
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}
