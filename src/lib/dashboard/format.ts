/**
 * Presentation helpers for Dashboard 2.0 values.
 *
 * Contract money is integer cents; percentages are decimal fractions.
 * Existing `formatCurrency` / `formatPercent` expect dollars and percentage
 * points — these wrappers bridge the gap and keep null ≠ 0.
 */

import { centsToDollars, type Cents, type Fraction } from "@/lib/dashboard/contract"
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/utils"

/** Render cents as currency. */
export function formatCents(cents: Cents): string {
  return formatCurrency(centsToDollars(cents))
}

/** Signed currency from cents ("+$12.50", "−$3.00"). */
export function formatSignedCents(cents: Cents): string {
  return formatSignedCurrency(centsToDollars(cents))
}

/**
 * Value Change fraction → display percent. Null is never "0%".
 */
export function formatValueChangePct(fraction: Fraction | null | undefined): string {
  if (fraction == null) return "—"
  return formatPercent(fraction * 100)
}

/**
 * Absolute + percent Value Change pair for headers.
 * Either side may be unknown independently.
 */
export function formatValueChangePair(
  absCents: Cents | null | undefined,
  fraction: Fraction | null | undefined
): string {
  const abs =
    absCents == null ? "—" : formatSignedCents(absCents)
  const pct = formatValueChangePct(fraction)
  if (abs === "—" && pct === "—") return "—"
  return `${abs} / ${pct}`
}

/** Em dash for any missing scalar the UI must not coerce to zero. */
export function formatUnknown(): string {
  return "—"
}

export function isPositiveChange(fraction: Fraction | null | undefined): boolean | null {
  if (fraction == null) return null
  return fraction >= 0
}
