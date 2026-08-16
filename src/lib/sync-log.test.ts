import { describe, expect, it } from "vitest"
import type { AppSettings } from "@/lib/supabase"
import { nextScheduledDescription } from "./sync-log"

const settings: AppSettings = {
  id: 1,
  sync_days: [1, 4],
  sync_timezone: "America/New_York",
  updated_at: "2026-08-16T00:00:00.000Z",
}

describe("nextScheduledDescription", () => {
  it("describes the next configured cron instant with settings-page wording", () => {
    expect(nextScheduledDescription(settings, new Date("2026-08-16T12:00:00.000Z"))).toBe(
      "A scheduled run fires at Mon 5:00 AM there."
    )
  })

  it("moves to the next configured day after today's cron has fired", () => {
    expect(nextScheduledDescription(settings, new Date("2026-08-17T10:00:00.000Z"))).toBe(
      "A scheduled run fires at Thu 5:00 AM there."
    )
  })

  it("returns null when scheduled runs are disabled", () => {
    expect(nextScheduledDescription({ ...settings, sync_days: [] })).toBeNull()
  })
})
