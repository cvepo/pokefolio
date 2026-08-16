import { describe, expect, it } from "vitest"
import type { AppSettings } from "@/lib/supabase"
import { expectedSyncWindowDays } from "@/lib/sync-log"
import { derivePriceStatus } from "./price-status"

const settings: AppSettings = {
  id: 1,
  sync_days: [1, 4],
  sync_timezone: "America/New_York",
  updated_at: "2026-08-16T00:00:00.000Z",
}

describe("derivePriceStatus", () => {
  it("marks a last-known price stale when the latest sync failed for the product", () => {
    expect(
      derivePriceStatus({
        currentPrice: 100,
        lastPricedAt: "2026-08-16",
        asOfDate: "2026-08-16",
        failedLastSync: true,
        expectedWindowDays: expectedSyncWindowDays(settings),
      })
    ).toBe("stale")
  })

  it("derives age freshness from the configured sync schedule", () => {
    const expectedWindowDays = expectedSyncWindowDays(settings)

    expect(expectedWindowDays).toBe(4)
    expect(
      derivePriceStatus({
        currentPrice: 100,
        lastPricedAt: "2026-08-13",
        asOfDate: "2026-08-16",
        failedLastSync: false,
        expectedWindowDays,
      })
    ).toBe("ok")
    expect(
      derivePriceStatus({
        currentPrice: 100,
        lastPricedAt: "2026-08-11",
        asOfDate: "2026-08-16",
        failedLastSync: false,
        expectedWindowDays,
      })
    ).toBe("stale")
  })
})
