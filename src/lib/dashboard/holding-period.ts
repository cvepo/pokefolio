/**
 * Portfolio-level holding-period rollup from position rows (PRD §14).
 */

import type { Position } from "@/lib/dashboard/contract"

export type HoldingPeriodRollup = {
  /** Value-weighted average of per-position value-weighted ages. */
  valueWeightedAgeDays: number | null
  oldestOpenLotDate: string | null
  oldestOpenLotAgeDays: number | null
  lotsApproachingOneYear: number
  pricedPositionCount: number
}

export function rollupHoldingPeriod(positions: Position[]): HoldingPeriodRollup {
  let weightSum = 0
  let ageAcc = 0
  let oldestDate: string | null = null
  let oldestAge: number | null = null
  let approaching = 0
  let priced = 0

  for (const p of positions) {
    approaching += p.holdingPeriod.lotsApproachingOneYear

    const age = p.holdingPeriod.valueWeightedAgeDays
    if (age != null && p.marketValue > 0) {
      ageAcc += age * p.marketValue
      weightSum += p.marketValue
      priced += 1
    }

    const lotAge = p.holdingPeriod.oldestOpenLotAgeDays
    const lotDate = p.holdingPeriod.oldestOpenLotDate
    if (lotAge != null && (oldestAge == null || lotAge > oldestAge)) {
      oldestAge = lotAge
      oldestDate = lotDate
    }
  }

  return {
    valueWeightedAgeDays: weightSum > 0 ? ageAcc / weightSum : null,
    oldestOpenLotDate: oldestDate,
    oldestOpenLotAgeDays: oldestAge,
    lotsApproachingOneYear: approaching,
    pricedPositionCount: priced,
  }
}

export function formatAgeDays(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return "—"
  const d = Math.round(days)
  if (d < 30) return `${d}d`
  const months = Math.floor(d / 30)
  const rem = d % 30
  if (months < 12) return rem > 0 ? `${months}mo ${rem}d` : `${months}mo`
  const years = Math.floor(d / 365)
  const remDays = d % 365
  const remMonths = Math.floor(remDays / 30)
  if (remMonths > 0) return `${years}y ${remMonths}mo`
  return `${years}y`
}
