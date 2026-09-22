"use client"

import { useEffect, useRef, useState } from "react"
import type { InsightEvent, InsightsPayload, MarkSeenRequest } from "@/lib/dashboard/contract"
import {
  INSIGHT_CATEGORY_META,
  INSIGHT_DISPLAY_CAP,
  formatInsightsCounter,
  insightsForDisplay,
} from "@/lib/dashboard/insights"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

type WhatChangedProps = {
  insights: InsightsPayload
  /** Display-only cap (PRD §19) — never filters stored events. */
  displayCap?: number
  /**
   * Called when newly visible unseen events should be marked seen.
   * Defaults to POST /api/insights/seen. Pass a no-op in demo mode so the
   * public surface never hits the authenticated API.
   */
  onMarkSeen?: (eventIds: string[]) => void
}

export function WhatChanged({
  insights,
  displayCap = INSIGHT_DISPLAY_CAP,
  onMarkSeen,
}: WhatChangedProps) {
  const [expanded, setExpanded] = useState(false)
  const markedRef = useRef<Set<string>>(new Set())

  const { visible, shown, total, capped } = insightsForDisplay(insights.events, {
    expanded,
    cap: displayCap,
    totalCount: insights.totalCount,
  })

  // Mark newly visible unseen events as seen — does NOT resolve them (PRD §17).
  useEffect(() => {
    const unseen = visible
      .filter((e) => e.seenAt == null && !markedRef.current.has(e.id))
      .map((e) => e.id)
    if (unseen.length === 0) return

    for (const id of unseen) markedRef.current.add(id)

    if (onMarkSeen) {
      onMarkSeen(unseen)
      return
    }

    const body: MarkSeenRequest = { eventIds: unseen }
    fetch("/api/insights/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      // Endpoint may 404 until backend merges; local mark set prevents retry storms.
    })
  }, [visible, onMarkSeen])

  return (
    <DashboardPanel
      title="What Changed"
      actions={
        <>
          <span className="tabular-nums">{formatInsightsCounter(shown, total)}</span>
          {insights.unseenCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-medium tabular-nums">
              {insights.unseenCount} unseen
            </span>
          )}
          {(capped || expanded) && total > displayCap && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {expanded ? "Less" : "All"}
            </button>
          )}
        </>
      }
      bodyClassName="!p-1.5"
    >
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nothing new — portfolio is quiet.</p>
      ) : (
        <ul className="space-y-1">
          {visible.map((event) => (
            <InsightRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </DashboardPanel>
  )
}

function InsightRow({ event }: { event: InsightEvent }) {
  const meta = INSIGHT_CATEGORY_META[event.category]
  return (
    <li
      className={cn(
        "flex items-start gap-1.5 rounded-sm border border-border/80 px-2 py-1.5 min-h-[22px]",
        event.seenAt == null && "bg-accent/30"
      )}
    >
      <span
        className={cn("text-xs font-semibold shrink-0 w-3.5 text-center leading-5", meta.toneClass)}
        title={meta.label}
        aria-label={meta.label}
      >
        {meta.symbol}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug">{event.headline}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0">
          <span className={meta.toneClass}>{meta.label}</span>
          <span aria-hidden>·</span>
          <span>{event.setName}</span>
          {event.state === "resolved" && (
            <>
              <span aria-hidden>·</span>
              <span>Resolved</span>
            </>
          )}
          {event.seenAt == null && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-foreground/80">New</span>
            </>
          )}
        </p>
        {event.detail && (
          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{event.detail}</p>
        )}
      </div>
    </li>
  )
}
