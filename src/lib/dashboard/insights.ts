/**
 * What Changed panel helpers (PRD §19).
 *
 * Severity sort is authoritative from the API; the client re-sorts defensively.
 * The display cap of 5 never filters stored/counted data.
 */

import type { InsightCategory, InsightEvent } from "@/lib/dashboard/contract"

export const INSIGHT_DISPLAY_CAP = 5 as const

export const INSIGHT_CATEGORY_META: Record<
  InsightCategory,
  { symbol: string; label: string; toneClass: string }
> = {
  needs_attention: {
    symbol: "⚠",
    label: "Needs attention",
    toneClass: "text-amber-600 dark:text-amber-400",
  },
  positive: {
    symbol: "↗",
    label: "Positive",
    toneClass: "text-emerald-600 dark:text-emerald-400",
  },
  signal_change: {
    symbol: "↻",
    label: "Signal change",
    toneClass: "text-sky-600 dark:text-sky-400",
  },
}

/** Severity descending; stable for equal severity by triggeredAt desc. */
export function sortInsightsBySeverity(events: InsightEvent[]): InsightEvent[] {
  return [...events].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity
    return b.triggeredAt.localeCompare(a.triggeredAt)
  })
}

/**
 * Cap applies to rendering only. Returns the visible slice and totals for
 * the "5 shown / 8 total" counter.
 */
export function insightsForDisplay(
  events: InsightEvent[],
  options: { expanded?: boolean; cap?: number; totalCount?: number } = {}
): {
  visible: InsightEvent[]
  shown: number
  total: number
  capped: boolean
} {
  const cap = options.cap ?? INSIGHT_DISPLAY_CAP
  const sorted = sortInsightsBySeverity(events)
  const total = options.totalCount ?? sorted.length
  const visible = options.expanded ? sorted : sorted.slice(0, cap)
  return {
    visible,
    shown: visible.length,
    total,
    capped: !options.expanded && sorted.length > cap,
  }
}

export function formatInsightsCounter(shown: number, total: number): string {
  return `${shown} shown / ${total} total`
}
