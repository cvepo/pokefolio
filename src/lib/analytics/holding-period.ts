import { daysBetween } from "@/lib/compare-series"
import type { Lot } from "@/lib/holdings"
import type { HoldingPeriod } from "@/lib/dashboard/contract"

export function computeHoldingPeriod(
  lots: Lot[],
  currentUnitPrice: number | null,
  asOfDate: string
): HoldingPeriod {
  if (!lots.length) {
    return { valueWeightedAgeDays: null, oldestOpenLotDate: null, oldestOpenLotAgeDays: null, lotsApproachingOneYear: 0 }
  }
  const ages = lots.map((lot) => ({ lot, age: Math.max(0, daysBetween(lot.buyDate, asOfDate)) }))
  const oldest = [...ages].sort((a, b) => b.age - a.age)[0]
  const totalUnits = ages.reduce((sum, { lot }) => sum + lot.remaining, 0)
  const weightedAge = currentUnitPrice == null || totalUnits === 0
    ? null
    : ages.reduce((sum, { lot, age }) => sum + age * lot.remaining * currentUnitPrice, 0) /
      (totalUnits * currentUnitPrice)
  return {
    valueWeightedAgeDays: weightedAge,
    oldestOpenLotDate: oldest.lot.buyDate,
    oldestOpenLotAgeDays: oldest.age,
    lotsApproachingOneYear: ages.filter(({ age }) => age >= 335 && age <= 364).length,
  }
}
