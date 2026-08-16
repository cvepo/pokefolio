"use client"

import { useEffect, useRef, useState } from "react"
import type { InsightEvent, InsightsPayload, MarkSeenRequest } from "@/lib/dashboard/contract"
import {
  INSIGHT_CATEGORY_META,
  INSIGHT_DISPLAY_CAP,
  formatInsightsCounter,
  insightsForDisplay,
} from "@/lib/dashboard/insights"
import { cn } from "@/lib/utils"

type WhatChangedProps = {
  insights: InsightsPayload
  /** Display-only cap (PRD §19) — never filters stored events. */
  displayCap?: number
}

export function WhatChanged({ insights, displayCap = INSIGHT_DISPLAY_CAP }: WhatChangedProps) {
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

    const body: MarkSeenRequest = { eventIds: unseen }
    fetch("/api/insights/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      // Endpoint may 404 until backend merges; local mark set prevents retry storms.
    })
  }, [visible])

  return (
    <section className="border border-border rounded-md bg-card p-3 3xl:p-4 space-y-2 h-full">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          What Changed
        </h2>
        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
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
              {expanded ? "Show less" : "View all"}
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">Nothing new — portfolio is quiet.</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((event) => (
            <InsightRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </section>
  )
}

function InsightRow({ event }: { event: InsightEvent }) {
  const meta = INSIGHT_CATEGORY_META[event.category]
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md border border-border/80 px-2.5 py-2",
        event.seenAt == null && "bg-accent/30"
      )}
    >
      <span
        className={cn("text-sm font-semibold shrink-0 w-4 text-center", meta.toneClass)}
        title={meta.label}
        aria-label={meta.label}
      >
        {meta.symbol}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{event.headline}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
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
          <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">{event.detail}</p>
        )}
      </div>
    </li>
  )
}
