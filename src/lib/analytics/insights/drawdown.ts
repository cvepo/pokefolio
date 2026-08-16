import type { DrawdownPayload } from "@/lib/dashboard/contract"

export const DRAWDOWN_THRESHOLD = 0.15

export function drawdownTransition(opts: {
  wasInDrawdown: boolean | null
  drawdownPct: number | null
  trackedAth: number | null
  trackedAthDate: string | null
}): { payload: DrawdownPayload; resolved: boolean } | null {
  const active = opts.drawdownPct != null && opts.drawdownPct <= -DRAWDOWN_THRESHOLD
  if (opts.wasInDrawdown == null || opts.wasInDrawdown === active) return null
  if (opts.trackedAth == null || opts.trackedAthDate == null || opts.drawdownPct == null) return null
  return {
    resolved: !active,
    payload: {
      kind: "drawdown",
      drawdownPct: opts.drawdownPct,
      thresholdPct: DRAWDOWN_THRESHOLD,
      trackedAth: Math.round(opts.trackedAth * 100),
      trackedAthDate: opts.trackedAthDate,
    },
  }
}
