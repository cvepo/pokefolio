"use client"

import { useCallback, useEffect, useState } from "react"
import type { AppSettings, SyncRun } from "@/lib/supabase"

const SYNC_EVENT = "pokefolio:sync-updated"

/**
 * Shared sync state for the sidebar button and the settings page.
 *
 * Both mount their own copy of this hook, so a run started from either place
 * broadcasts on a window event and every listener refetches. Without it, the
 * sidebar would keep showing a stale "last sync" after syncing from Settings.
 */
export type SupabaseKeyMode = "service_role" | "anon" | "missing"
export type ServiceKeyType = "sb_secret" | "legacy_jwt" | "unknown" | "none"

export function useSyncStatus() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [lastRun, setLastRun] = useState<SyncRun | null>(null)
  const [keyMode, setKeyMode] = useState<SupabaseKeyMode | null>(null)
  const [keyType, setKeyType] = useState<ServiceKeyType | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings")
      if (!res.ok) throw new Error("Failed to load sync status")
      const data = await res.json()
      setSettings(data.settings ?? null)
      setLastRun(data.lastRun ?? null)
      setKeyMode(data.supabaseKeyMode ?? null)
      setKeyType(data.serviceKeyType ?? null)
    } catch {
      // Leave prior values in place — a failed poll shouldn't blank the UI.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onUpdate = () => refresh()
    window.addEventListener(SYNC_EVENT, onUpdate)
    return () => window.removeEventListener(SYNC_EVENT, onUpdate)
  }, [refresh])

  const runSync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Sync failed")
      await refresh()
      window.dispatchEvent(new Event(SYNC_EVENT))
      return data
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed"
      setError(message)
      await refresh()
      return null
    } finally {
      setSyncing(false)
    }
  }, [refresh])

  const saveSyncDays = useCallback(
    async (days: number[]) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync_days: days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to save schedule")
      setSettings(data.settings)
      window.dispatchEvent(new Event(SYNC_EVENT))
      return data.settings as AppSettings
    },
    []
  )

  return {
    settings,
    lastRun,
    keyMode,
    keyType,
    loading,
    syncing,
    error,
    runSync,
    refresh,
    saveSyncDays,
  }
}

/** Human label for how a run was started. */
export function triggerLabel(trigger: SyncRun["trigger"]): string {
  return trigger === "cron" ? "Scheduled" : "Manual"
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
