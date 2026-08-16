"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  ApiEnvelope,
  ApiError,
  DashboardPayload,
  DashboardQuery,
  Timeframe,
} from "@/lib/dashboard/contract"

export type UseDashboardOptions = DashboardQuery & {
  /** When false, the hook does not fetch. Defaults to true. */
  enabled?: boolean
}

export type UseDashboardResult = {
  data: ApiEnvelope<DashboardPayload> | null
  loading: boolean
  error: string | null
  errorCode: ApiError["code"] | null
  refresh: () => Promise<void>
  /** Echo of the query used for the last successful or attempted fetch. */
  portfolioId: string | undefined
  timeframe: Timeframe
}

function buildUrl(portfolioId: string | undefined, timeframe: Timeframe): string {
  const params = new URLSearchParams()
  if (portfolioId) params.set("portfolioId", portfolioId)
  params.set("timeframe", timeframe)
  return `/api/dashboard?${params.toString()}`
}

/**
 * Client hook for the Dashboard 2.0 BFF.
 *
 * 404 / network failures are ordinary error states — the endpoint does not
 * exist in this worktree until the backend branch merges. Callers may fall
 * back to fixtures for local review; this hook never invents data.
 */
export function useDashboard(options: UseDashboardOptions = {}): UseDashboardResult {
  const { portfolioId, timeframe = "1M", enabled = true } = options

  const [data, setData] = useState<ApiEnvelope<DashboardPayload> | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<ApiError["code"] | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const res = await fetch(buildUrl(portfolioId, timeframe))
      const body = (await res.json().catch(() => null)) as
        | ApiEnvelope<DashboardPayload>
        | ApiError
        | null

      if (!res.ok) {
        const apiErr = body && "error" in body ? (body as ApiError) : null
        setData(null)
        setError(apiErr?.error ?? `Failed to load dashboard (${res.status})`)
        setErrorCode(apiErr?.code ?? (res.status === 404 ? "not_found" : "internal"))
        return
      }

      if (!body || !("data" in body)) {
        setData(null)
        setError("Malformed dashboard response")
        setErrorCode("internal")
        return
      }

      setData(body as ApiEnvelope<DashboardPayload>)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : "Failed to load dashboard")
      setErrorCode("internal")
    } finally {
      setLoading(false)
    }
  }, [enabled, portfolioId, timeframe])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    data,
    loading,
    error,
    errorCode,
    refresh,
    portfolioId,
    timeframe,
  }
}
