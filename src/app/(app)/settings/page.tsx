"use client"

import { useEffect, useState } from "react"
import { RefreshCw, CheckCircle, AlertCircle, AlertTriangle, Clock } from "lucide-react"
import { DAY_LABELS, triggerLabel, useSyncStatus } from "@/lib/use-sync-status"
import { cn, formatDateTime } from "@/lib/utils"

export default function SettingsPage() {
  const { settings, lastRun, keyMode, loading, syncing, error, runSync, saveSyncDays } =
    useSyncStatus()

  const [draftDays, setDraftDays] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed the draft once settings arrive; don't clobber in-progress edits.
  useEffect(() => {
    if (settings && draftDays === null) setDraftDays(settings.sync_days)
  }, [settings, draftDays])

  const days = draftDays ?? []
  const dirty =
    settings != null &&
    draftDays != null &&
    JSON.stringify([...draftDays].sort()) !== JSON.stringify([...settings.sync_days].sort())

  function toggleDay(d: number) {
    setSaved(false)
    setSaveError(null)
    setDraftDays((prev) => {
      const curr = prev ?? []
      return curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d].sort((a, b) => a - b)
    })
  }

  async function handleSave() {
    if (!draftDays) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveSyncDays(draftDays)
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage sync and API usage</p>
      </div>

      {/* Last sync — read from the permanent sync_runs log */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Last sync</h2>
          <button
            onClick={() => runSync()}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>

        {loading ? (
          <div className="h-16 bg-muted rounded animate-pulse" />
        ) : lastRun ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <StatusIcon status={lastRun.status} />
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {formatDateTime(lastRun.finished_at ?? lastRun.started_at)}
                </p>
                <p className="text-muted-foreground">
                  {triggerLabel(lastRun.trigger)} run ·{" "}
                  {lastRun.status === "skipped"
                    ? "skipped (not a scheduled day)"
                    : lastRun.status === "failed"
                      ? "failed"
                      : `${lastRun.products_synced} of ${lastRun.products_total} products priced`}
                </p>
                {lastRun.status !== "skipped" && (
                  <p className="text-xs text-muted-foreground">
                    {lastRun.history_points_written} history points ·{" "}
                    {lastRun.backfilled_products} backfilled ·{" "}
                    {lastRun.api_requests_used} API request
                    {lastRun.api_requests_used !== 1 ? "s" : ""} used
                    {lastRun.api_monthly_remaining != null && (
                      <> · {lastRun.api_monthly_remaining} monthly remaining</>
                    )}
                  </p>
                )}
                {lastRun.error && <p className="text-xs text-destructive">{lastRun.error}</p>}
              </div>
            </div>

            {lastRun.failures?.length > 0 && (
              <div className="rounded-md bg-amber-500/10 p-3 text-xs space-y-1">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  {lastRun.failures.length} product
                  {lastRun.failures.length !== 1 ? "s" : ""} returned no price
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {lastRun.failures.map((f) => (
                    <li key={f.product_id}>{f.name ?? f.product_id}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sync has been recorded yet. Press <span className="font-medium">Sync now</span> to
            run one.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-md text-sm bg-destructive/10 text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-4">
        <div>
          <h2 className="font-semibold">Sync schedule</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            The scheduled job runs every morning and checks this list. On days you unselect it
            exits immediately without using any API requests.
          </p>
        </div>

        {loading || draftDays === null ? (
          <div className="h-10 bg-muted rounded animate-pulse" />
        ) : (
          <>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, i) => {
                const on = days.includes(i)
                return (
                  <button
                    key={label}
                    onClick={() => toggleDay(i)}
                    aria-pressed={on}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                      on
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "text-muted-foreground border-border hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSave}
                disabled={!dirty || saving || days.length === 0}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? "Saving…" : "Save schedule"}
              </button>
              {days.length === 0 && (
                <span className="text-xs text-destructive">
                  Pick at least one day, or the scheduled sync will never run.
                </span>
              )}
              {saved && !dirty && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
              )}
              {saveError && <span className="text-xs text-destructive">{saveError}</span>}
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Clock size={13} className="mt-0.5 shrink-0" />
              <span>
                Days are evaluated in {settings?.sync_timezone ?? "America/New_York"}. Manual syncs
                always run, whatever day it is.
              </span>
            </p>
          </>
        )}
      </div>

      {/* Database credential mode — gates the RLS migration */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <h2 className="font-semibold">Database access</h2>
        {loading ? (
          <div className="h-12 bg-muted rounded animate-pulse" />
        ) : keyMode === "service_role" ? (
          <div className="flex items-start gap-2.5 text-sm">
            <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-medium">Using the service-role key</p>
              <p className="text-muted-foreground">
                Safe to enable Row Level Security. Run{" "}
                <code className="text-xs">004_enable_rls.sql</code> to lock the public anon key out
                of the database.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">
                {keyMode === "missing" ? "No database key configured" : "Using the public anon key"}
              </p>
              <p className="text-muted-foreground">
                Set <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> in your environment
                and redeploy. <span className="font-medium">Do not enable RLS until this reads
                &ldquo;service-role&rdquo;</span> — every query would start failing.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* API plan */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <h2 className="font-semibold">API Plan</h2>
        <div className="text-sm space-y-1.5 text-muted-foreground">
          <p>Plan: <span className="text-foreground font-medium">Free</span></p>
          <p>Monthly limit: <span className="text-foreground font-medium">1,000 requests</span></p>
          <p>Daily limit: <span className="text-foreground font-medium">100 requests</span></p>
          <p>Rate limit: <span className="text-foreground font-medium">10 requests / minute</span></p>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          A sync costs 1 request per 20 tracked products, plus up to 4 repair requests for products
          with sparse history. Each manual search costs 1 request.
        </p>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") {
    return <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-500" />
  }
  if (status === "partial") {
    return <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
  }
  if (status === "skipped") {
    return <Clock size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
  }
  return <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
}
