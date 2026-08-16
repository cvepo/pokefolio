import { NextResponse } from "next/server"
import type { MarkSeenRequest } from "@/lib/dashboard/contract"
import { supabase } from "@/lib/supabase-server"

export async function POST(request: Request) {
  const body = (await request.json()) as MarkSeenRequest
  if (!Array.isArray(body.eventIds)) {
    return NextResponse.json({ error: "eventIds must be an array" }, { status: 400 })
  }
  if (!body.eventIds.length) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  // Seen is independent from active/resolved state. Only stamp rows that have
  // not been acknowledged so retries remain harmless.
  const { data, error } = await supabase
    .from("insight_events")
    .update({ seen_at: new Date().toISOString() })
    .in("id", body.eventIds)
    .is("seen_at", null)
    .select("id")
  if (error) {
    return NextResponse.json({ error: error.message, code: "internal" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}
