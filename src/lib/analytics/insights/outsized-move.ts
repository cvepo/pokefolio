import type { OutsizedMovePayload, Timeframe } from "@/lib/dashboard/contract"

export const OUTSIZED_MOVE_THRESHOLD = 0.1
export type OutsizedMoveState = "NORMAL" | "OUTSIZED_UP" | "OUTSIZED_DOWN"

export function outsizedMoveState(movePct: number | null): OutsizedMoveState {
  if (movePct == null || Math.abs(movePct) < OUTSIZED_MOVE_THRESHOLD) return "NORMAL"
  return movePct > 0 ? "OUTSIZED_UP" : "OUTSIZED_DOWN"
}

export function outsizedMoveTransition(
  previous: OutsizedMoveState,
  movePct: number | null,
  timeframe: Timeframe = "1M"
): OutsizedMovePayload | null {
  const next = outsizedMoveState(movePct)
  if (previous === next) return null
  // Direct up↔down reversals pass through NORMAL conceptually but produce the
  // single transition reflecting the currently observed condition.
  return {
    kind: "outsized_move",
    direction: next === "OUTSIZED_DOWN" ? "down" : next === "OUTSIZED_UP" ? "up" : previous === "OUTSIZED_DOWN" ? "down" : "up",
    movePct: movePct ?? 0,
    timeframe,
    fromState: previous,
    toState: next,
  }
}
