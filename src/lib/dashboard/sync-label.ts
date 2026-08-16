/**
 * Sync freshness pill labels (PRD §12).
 * Never imply a refresh from a failed attempt — lastSuccessfulAt drives "Synced Xm ago".
 */

import type { SyncState, SyncStatusPayload } from "@/lib/dashboard/contract"

export type SyncPillTone = "ok" | "warn" | "bad" | "info"

export function syncStateLabel(state: SyncState): string {
  switch (state) {
    case "fresh":
      return "Fresh"
    case "partially_priced":
      return "Partially priced"
    case "stale":
      return "Stale"
    case "in_progress":
      return "Sync in progress"
    case "failed":
      return "Last sync failed"
  }
}

export function syncPillTone(state: SyncState): SyncPillTone {
  switch (state) {
    case "fresh":
      return "ok"
    case "partially_priced":
    case "stale":
      return "warn"
    case "failed":
      return "bad"
    case "in_progress":
      return "info"
  }
}

/** Compact relative age from an ISO timestamp, e.g. "8m ago", "2h ago". */
export function formatRelativeAge(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const diffMs = Math.max(0, now.getTime() - then.getTime())
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function syncSuccessLabel(sync: SyncStatusPayload, now = new Date()): string {
  if (sync.state === "in_progress") return "Syncing…"
  if (sync.state === "failed") {
    const age = formatRelativeAge(sync.lastAttemptedAt, now)
    return age ? `Failed ${age}` : "Last sync failed"
  }
  const age = formatRelativeAge(sync.lastSuccessfulAt, now)
  if (!age) return syncStateLabel(sync.state)
  return `Synced ${age}`
}
