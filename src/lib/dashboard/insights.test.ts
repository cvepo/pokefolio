import { describe, expect, it } from "vitest"
import type { InsightEvent } from "@/lib/dashboard/contract"
import {
  INSIGHT_DISPLAY_CAP,
  formatInsightsCounter,
  insightsForDisplay,
  sortInsightsBySeverity,
} from "@/lib/dashboard/insights"

function event(partial: Partial<InsightEvent> & Pick<InsightEvent, "id" | "severity">): InsightEvent {
  return {
    type: "concentration",
    category: "needs_attention",
    state: "active",
    entityId: "p",
    entityName: "Product",
    setName: "Set",
    headline: "headline",
    detail: null,
    triggeredAt: "2026-08-16T00:00:00Z",
    resolvedAt: null,
    seenAt: null,
    snapshotId: "snap",
    dedupeKey: partial.id,
    payload: { kind: "concentration", sharePct: 0.25, thresholdPct: 0.2 },
    ...partial,
  }
}

describe("sortInsightsBySeverity", () => {
  it("orders severity descending", () => {
    const sorted = sortInsightsBySeverity([
      event({ id: "a", severity: 10 }),
      event({ id: "b", severity: 90 }),
      event({ id: "c", severity: 40 }),
    ])
    expect(sorted.map((e) => e.id)).toEqual(["b", "c", "a"])
  })
})

describe("insightsForDisplay", () => {
  const eight = Array.from({ length: 8 }, (_, i) =>
    event({ id: `e${i}`, severity: 100 - i })
  )

  it("caps visible rows without dropping the total count", () => {
    const result = insightsForDisplay(eight, { totalCount: 8 })
    expect(result.visible).toHaveLength(INSIGHT_DISPLAY_CAP)
    expect(result.shown).toBe(5)
    expect(result.total).toBe(8)
    expect(result.capped).toBe(true)
    // Source array untouched in length terms — we only sliced a copy.
    expect(eight).toHaveLength(8)
  })

  it("expands past the display cap when requested", () => {
    const result = insightsForDisplay(eight, { expanded: true, totalCount: 8 })
    expect(result.visible).toHaveLength(8)
    expect(result.shown).toBe(8)
    expect(result.capped).toBe(false)
  })

  it("uses API totalCount even when fewer events are loaded", () => {
    const result = insightsForDisplay(eight.slice(0, 3), { totalCount: 8 })
    expect(result.shown).toBe(3)
    expect(result.total).toBe(8)
  })
})

describe("formatInsightsCounter", () => {
  it("matches the PRD §19 copy shape", () => {
    expect(formatInsightsCounter(5, 8)).toBe("5 shown / 8 total")
  })
})
