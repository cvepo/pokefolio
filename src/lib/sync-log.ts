import { supabase } from "@/lib/supabase-server"
import type { AppSettings, SyncRun, SyncStatus, SyncTrigger } from "@/lib/supabase"

const DEFAULT_SETTINGS: Omit<AppSettings, "updated_at"> = {
  id: 1,
  sync_days: [0, 1, 2, 3, 4, 5, 6],
  sync_timezone: "America/New_York",
}

/**
 * Read the single app_settings row. Falls back to "sync every day" if the row
 * or table is missing, so a missing migration degrades to the old behaviour
 * rather than silently disabling sync.
 */
export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle()
  if (error || !data) {
    return { ...DEFAULT_SETTINGS, updated_at: new Date().toISOString() }
  }
  return data as AppSettings
}

/**
 * Which weekday is it right now in `timeZone`, as a JS getDay() number
 * (0=Sunday … 6=Saturday)?
 *
 * Uses Intl rather than getUTCDay() so a schedule of "Wednesday" means the
 * user's Wednesday. A cron firing at 09:00 UTC on Thursday is still Wednesday
 * evening in America/New_York, and the schedule must honour that.
 */
export function weekdayInTimeZone(timeZone: string, at: Date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[short] ?? at.getUTCDay()
}

/** Is today a scheduled sync day? Manual runs bypass this entirely. */
export function isScheduledToday(settings: AppSettings, at: Date = new Date()): boolean {
  if (!settings.sync_days?.length) return false
  return settings.sync_days.includes(weekdayInTimeZone(settings.sync_timezone, at))
}

/** Insert a run row at the start of a sync. Returns the row id, or null if logging is unavailable. */
export async function startSyncRun(trigger: SyncTrigger): Promise<string | null> {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({ trigger, status: "failed", started_at: new Date().toISOString() })
    .select("id")
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

/**
 * Close out a run. Status starts as 'failed' at insert time so that a function
 * timeout or crash leaves an honest record behind rather than a row that looks
 * like it succeeded.
 */
export async function finishSyncRun(
  id: string | null,
  patch: Partial<Omit<SyncRun, "id" | "started_at" | "trigger">> & { status: SyncStatus }
): Promise<void> {
  if (!id) return
  await supabase
    .from("sync_runs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", id)
}

/** Most recent run of any kind, or null if none has been recorded yet. */
export async function getLastSyncRun(): Promise<SyncRun | null> {
  const { data, error } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data as SyncRun
}
