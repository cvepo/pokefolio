import { NextResponse } from "next/server"
import { TIMEFRAMES, type Timeframe } from "./contract"
import { AnalyticsSchemaMissingError, NoPublishedSnapshotError } from "./data"

export function query(request: Request) {
  const params = new URL(request.url).searchParams
  const rawTimeframe = params.get("timeframe") ?? "1M"

  return {
    portfolioId: params.get("portfolioId") ?? undefined,
    timeframe: (
      TIMEFRAMES.includes(rawTimeframe as Timeframe) ? rawTimeframe : "1M"
    ) as Timeframe,
    limit: Math.min(
      100,
      Math.max(0, Number.parseInt(params.get("limit") ?? "10", 10) || 10)
    ),
  }
}

export async function response<T>(work: () => Promise<T>) {
  try {
    return NextResponse.json(await work())
  } catch (error) {
    // A dashboard that cannot load should say which of the two setup steps is
    // missing. Both look like an empty page, but one needs SQL run and the
    // other needs a sync — telling them apart saves debugging the wrong layer.
    if (error instanceof AnalyticsSchemaMissingError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "schema_missing",
          hint: "Run supabase/migrations/005-008 in the Supabase SQL editor, then sync.",
        },
        { status: 503 }
      )
    }
    if (error instanceof NoPublishedSnapshotError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "no_snapshot",
          hint: "Run a sync, or add/edit a transaction, to publish the first snapshot.",
        },
        { status: 503 }
      )
    }
    console.error("[dashboard]", error)
    return NextResponse.json(
      { error: "Dashboard data is unavailable", code: "internal" },
      { status: 500 }
    )
  }
}
