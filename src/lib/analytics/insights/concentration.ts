import type { ConcentrationPayload } from "@/lib/dashboard/contract"

export const CONCENTRATION_THRESHOLD = 0.2

export type ConcentrationTransition = { payload: ConcentrationPayload; resolved: boolean } | null

export function concentrationTransition(
  wasConcentrated: boolean | null,
  sharePct: number
): ConcentrationTransition {
  const isConcentrated = sharePct >= CONCENTRATION_THRESHOLD
  if (wasConcentrated == null || wasConcentrated === isConcentrated) return null
  return {
    resolved: !isConcentrated,
    payload: { kind: "concentration", sharePct, thresholdPct: CONCENTRATION_THRESHOLD },
  }
}
