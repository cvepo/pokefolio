import type { InsightPayload } from "@/lib/dashboard/contract"

export const SIGNAL_NEGATIVE_BASE = 70
export const SIGNAL_RECOVERY_BASE = 35
export const OUTSIZED_NEGATIVE_BASE = 50
export const OUTSIZED_POSITIVE_BASE = 30
export const CONCENTRATION_BASE = 60
export const DRAWDOWN_BASE = 40

export function insightSeverity(payload: InsightPayload): number {
  switch (payload.kind) {
    case "signal_transition":
      return payload.toSignal === "Declining" || payload.toSignal === "Cooling"
        ? SIGNAL_NEGATIVE_BASE
        : SIGNAL_RECOVERY_BASE
    case "outsized_move":
      return (payload.direction === "down" ? OUTSIZED_NEGATIVE_BASE : OUTSIZED_POSITIVE_BASE) + Math.abs(payload.movePct) * 100
    case "concentration":
      return CONCENTRATION_BASE + Math.max(0, payload.sharePct - payload.thresholdPct) * 100
    case "drawdown":
      return DRAWDOWN_BASE + Math.abs(payload.drawdownPct) * 100
  }
}
