import { NextResponse } from "next/server"
import { supabase, supabaseKeyMode } from "@/lib/supabase-server"
import { getAppSettings, getLastSyncRun } from "@/lib/sync-log"

/** GET /api/settings — sync schedule, latest sync run, and DB credential mode. */
export async function GET() {
  const [settings, lastRun] = await Promise.all([getAppSettings(), getLastSyncRun()])
  // supabaseKeyMode tells the UI whether it's safe to enable RLS yet. Only the
  // mode name is exposed — never the key itself.
  return NextResponse.json({ settings, lastRun, supabaseKeyMode })
}

/** PATCH /api/settings — update which weekdays the scheduled sync runs on. */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.sync_days)) {
    return NextResponse.json({ error: "sync_days must be an array" }, { status: 400 })
  }

  const days = [...new Set((body.sync_days as unknown[]).map(Number))]
    .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a: number, b: number) => a - b)

  if (days.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one day, or the scheduled sync will never run." },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("app_settings")
    .update({ sync_days: days, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
