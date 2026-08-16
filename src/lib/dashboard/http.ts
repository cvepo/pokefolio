import { NextResponse } from "next/server"
import { TIMEFRAMES, type Timeframe } from "./contract"
import { NoPublishedSnapshotError } from "./data"

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
    if (error instanceof NoPublishedSnapshotError) {
      return NextResponse.json(
        { error: error.message, code: "no_snapshot" },
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
