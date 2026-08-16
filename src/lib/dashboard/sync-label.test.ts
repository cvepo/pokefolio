import { describe, expect, it } from "vitest"
import type { SyncStatusPayload } from "@/lib/dashboard/contract"
import {
  formatRelativeAge,
  syncPillTone,
  syncStateLabel,
  syncSuccessLabel,
} from "@/lib/dashboard/sync-label"

describe("formatRelativeAge", () => {
  const now = new Date("2026-08-16T04:20:00Z")

  it("returns null for missing timestamps", () => {
    expect(formatRelativeAge(null, now)).toBeNull()
  })

  it("formats minutes and hours", () => {
    expect(formatRelativeAge("2026-08-16T04:12:00Z", now)).toBe("8m ago")
    expect(formatRelativeAge("2026-08-16T01:20:00Z", now)).toBe("3h ago")
  })
})

describe("syncSuccessLabel", () => {
  const base: SyncStatusPayload = {
    state: "fresh",
    lastAttemptedAt: "2026-08-16T04:12:00Z",
    lastAttemptStatus: "success",
    lastSuccessfulAt: "2026-08-16T04:12:00Z",
    productsTotal: 10,
    productsSynced: 10,
    productsFailed: 0,
    failures: [],
    stalePositionCount: 0,
    nextScheduledDescription: null,
  }
  const now = new Date("2026-08-16T04:20:00Z")

  it("uses lastSuccessfulAt for the synced age", () => {
    expect(syncSuccessLabel(base, now)).toBe("Synced 8m ago")
  })

  it("does not claim a refresh after a failed attempt", () => {
    expect(
      syncSuccessLabel(
        {
          ...base,
          state: "failed",
          lastAttemptStatus: "failed",
          lastAttemptedAt: "2026-08-16T04:18:00Z",
          lastSuccessfulAt: "2026-08-15T04:00:00Z",
        },
        now
      )
    ).toBe("Failed 2m ago")
  })
})

describe("syncStateLabel / tone", () => {
  it("covers every SyncState", () => {
    expect(syncStateLabel("partially_priced")).toBe("Partially priced")
    expect(syncPillTone("failed")).toBe("bad")
    expect(syncPillTone("fresh")).toBe("ok")
  })
})
