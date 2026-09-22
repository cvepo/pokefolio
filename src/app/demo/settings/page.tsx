"use client"

import { AlertCircle, Clock } from "lucide-react"
import { useDemoStore } from "@/lib/demo/use-demo-store"

/**
 * Demo Settings — sync controls are deliberately disabled.
 * Do not animate a fake sync; say sync is off.
 */
export default function DemoSettingsPage() {
  const store = useDemoStore()

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Demo mode — sync is unavailable</p>
      </div>

      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Sync is off in the demo</p>
            <p className="text-muted-foreground">
              This is a sample collection with prices frozen as of{" "}
              <span className="font-medium text-foreground tabular-nums">{store.today}</span>.
              Nothing is fetched from TCGPlayer or written to a database. Changes you make
              stay in this browser tab until you reset or close it.
            </p>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-lg p-5 bg-card space-y-3 opacity-60">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Last sync</h2>
          <button
            type="button"
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium opacity-50 cursor-not-allowed"
          >
            Sync now
          </button>
        </div>
        <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Clock size={16} className="mt-0.5 shrink-0" />
          <p>No sync runs in demo mode.</p>
        </div>
      </div>

      <div className="border border-border rounded-lg p-5 bg-card space-y-3 opacity-60">
        <h2 className="font-semibold">Scheduled sync days</h2>
        <p className="text-sm text-muted-foreground">
          Scheduling is part of the live app and is not available here.
        </p>
      </div>
    </div>
  )
}
