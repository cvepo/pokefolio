import type { Position, PositionSignal } from "@/lib/dashboard/contract"
import { supabase } from "@/lib/supabase-server"
import {
  computeInsightTransitions,
  type InsightPositionState,
} from "./compute"
import type { OutsizedMoveState } from "./outsized-move"

type PersistedPositionState = {
  product_id: string
  last_signal: PositionSignal | null
  last_outsized_move_state: OutsizedMoveState
  last_concentration_state: boolean | null
  last_drawdown_state: boolean | null
  updated_at: string
}

export async function persistInsightTransitions(
  snapshotId: string,
  positions: Position[],
  at: string
): Promise<number> {
  if (!positions.length) return 0

  const ids = positions.map((position) => position.productId)
  const { data: rows } = await supabase
    .from("position_signal_state")
    .select("*")
    .in("product_id", ids)
  const previousStates = ((rows ?? []) as PersistedPositionState[]).map(
    (row): InsightPositionState => ({
      productId: row.product_id,
      lastSignal: row.last_signal,
      lastOutsizedMoveState: row.last_outsized_move_state,
      lastConcentrationState: row.last_concentration_state,
      lastDrawdownState: row.last_drawdown_state,
      updatedAt: row.updated_at,
    })
  )
  const result = computeInsightTransitions({
    snapshotId,
    positions,
    at,
    previousStates,
  })

  for (const resolution of result.resolutions) {
    await supabase
      .from("insight_events")
      .update({ state: "resolved", resolved_at: at })
      .eq("entity_id", resolution.entityId)
      .eq("type", resolution.type)
      .eq("state", "active")
  }

  for (const state of result.states) {
    await supabase.from("position_signal_state").upsert({
      product_id: state.productId,
      last_signal: state.lastSignal,
      last_outsized_move_state: state.lastOutsizedMoveState,
      last_concentration_state: state.lastConcentrationState,
      last_drawdown_state: state.lastDrawdownState,
      updated_at: state.updatedAt,
    })
  }

  if (!result.events.length) return 0
  const events = result.events.map((event) => ({
    type: event.type,
    entity_id: event.entityId,
    state: event.state,
    severity: event.severity,
    triggered_at: event.triggeredAt,
    resolved_at: event.resolvedAt,
    snapshot_id: event.snapshotId,
    dedupe_key: event.dedupeKey,
    payload: event.payload,
  }))

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
