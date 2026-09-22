"use client"

import { RotateCcw } from "lucide-react"
import { useDemoStore } from "@/lib/demo/use-demo-store"

/**
 * Slim persistent bar: sample data, local-only changes, optional Reset.
 * Must stay visible without covering page content.
 */
export function DemoBanner() {
  const store = useDemoStore()
  const dirty = store.state.dirty

  return (
    <div className="shrink-0 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-100">
      <p className="min-w-0 truncate">
        <span className="font-semibold">Sample collection</span>
        <span className="text-amber-800/80 dark:text-amber-200/80">
          {" — "}changes stay in this browser tab and are never saved.
        </span>
      </p>
      {dirty && (
        <button
          type="button"
          onClick={() => store.reset()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-600/40 bg-background/60 px-2 py-1 font-medium hover:bg-background transition-colors"
        >
          <RotateCcw size={12} aria-hidden />
          Reset demo
        </button>
      )}
    </div>
  )
}
