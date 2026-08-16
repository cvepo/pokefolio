import type { PositionSignal, SignalTransitionPayload } from "@/lib/dashboard/contract"

export function signalTransition(
  previous: PositionSignal | null,
  next: PositionSignal
): SignalTransitionPayload | null {
  if (previous == null || previous === next) return null
  if (previous === "Insufficient data" || next === "Insufficient data") return null
  return { kind: "signal_transition", fromSignal: previous, toSignal: next }
}
