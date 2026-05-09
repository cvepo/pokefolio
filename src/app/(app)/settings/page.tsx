"use client"

import { useState } from "react"
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react"

type SyncResult = {
  ok: boolean
  synced?: number
  date?: string
  message?: string
  apiUsage?: {
    apiDailyRequestsRemaining: number
    apiRequestsRemaining: number
    apiDailyLimit: number
    apiRequestLimit: number
  }
  error?: string
}

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    const res = await fetch("/api/sync", { method: "POST" })
    const data = await res.json()
    setResult(data)
    setSyncing(false)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage sync and API usage</p>
      </div>

      {/* Manual sync */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <div>
          <h2 className="font-semibold">Manual Price Sync</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fetch the latest prices for all products in your portfolios. Runs automatically daily at midnight UTC via Vercel Cron.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Run Sync Now"}
        </button>

        {result && (
          <div className={`flex items-start gap-2.5 p-3 rounded-md text-sm ${result.ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
            {result.ok ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <div className="space-y-1">
              {result.ok ? (
                <>
                  <p className="font-medium">Sync complete</p>
                  <p>{result.message ?? `Updated ${result.synced} product${result.synced !== 1 ? "s" : ""} on ${result.date}`}</p>
                  {result.apiUsage && (
                    <p className="text-xs opacity-80">
                      API usage: {result.apiUsage.apiDailyRequestsRemaining} daily / {result.apiUsage.apiRequestsRemaining} monthly remaining
                    </p>
                  )}
                </>
              ) : (
                <p>{result.error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <h2 className="font-semibold">API Plan</h2>
        <div className="text-sm space-y-1.5 text-muted-foreground">
          <p>Plan: <span className="text-foreground font-medium">Free</span></p>
          <p>Monthly limit: <span className="text-foreground font-medium">1,000 requests</span></p>
          <p>Daily limit: <span className="text-foreground font-medium">100 requests</span></p>
          <p>Rate limit: <span className="text-foreground font-medium">10 requests / minute</span></p>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Each manual search uses 1 request. The daily sync uses ~1 request per 20 tracked products.
        </p>
      </div>
    </div>
  )
}
