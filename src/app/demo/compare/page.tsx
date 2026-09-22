"use client"

import { useMemo } from "react"
import { CompareView } from "@/components/compare/compare-view"
import { useDemoStore } from "@/lib/demo/use-demo-store"

/**
 * Compare, for the demo.
 *
 * Renders the same CompareView the authenticated page does — real chart,
 * selector and table — fed from the sandbox store's frozen price history
 * instead of /api/compare/series.
 *
 * This page previously showed a table with no chart, because the demo store had
 * no way to reach price history. The contract gained getCompareSeries and the
 * page now shows the actual feature.
 */
export default function DemoComparePage() {
  const store = useDemoStore()
  // Recompute when the visitor buys or sells — a new holding should appear as a
  // new line, and a fully closed one should drop out.
  const data = useMemo(() => store.getCompareSeries(), [store, store.revision])

  if (!data.products.length) {
    return (
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
        <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-2">
          <p className="font-medium">Nothing to compare yet</p>
          <p className="text-sm text-muted-foreground">
            Add a holding from Search and it will show up here.
          </p>
        </div>
      </div>
    )
  }

  return <CompareView data={data} settingsHref="/demo/settings" />
}
