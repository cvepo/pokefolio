"use client"

import { useCallback, useEffect, useState } from "react"
import type { CompareSeriesResponse } from "@/lib/compare-series"
import { CompareView } from "@/components/compare/compare-view"

/**
 * Compare, for the authenticated app.
 *
 * Only responsibility is fetching the series; the view itself lives in
 * CompareView so the public demo renders exactly the same thing from its own
 * data source rather than a reduced copy.
 */
export default function ComparePage() {
  const [data, setData] = useState<CompareSeriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/compare/series")
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Failed to load (${res.status})`)
      }
      setData((await res.json()) as CompareSeriesResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load compare data")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-4">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-4 w-72 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
        </div>
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
        <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
          <p className="font-medium">Couldn’t load Compare</p>
          <p className="text-sm text-muted-foreground">{error ?? "No data returned"}</p>
          <button
            type="button"
            onClick={() => load()}
            className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return <CompareView data={data} />
}
