"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type DashboardPanelProps = {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Extra classes on the scrollable body. */
  bodyClassName?: string
  /** When false, body does not scroll (e.g. chart owns the region). */
  scrollBody?: boolean
}

/**
 * Terminal pane chrome: compact title bar + optional internal scroll.
 * Parents must supply min-h-0 so the pane can shrink inside a dvh grid.
 */
export function DashboardPanel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  scrollBody = true,
}: DashboardPanelProps) {
  return (
    <section
      className={cn(
        "dashboard-panel flex flex-col h-full min-h-0 min-w-0 overflow-hidden",
        "rounded-sm border border-border bg-card",
        className
      )}
    >
      <header className="dashboard-panel-header shrink-0 flex items-center justify-between gap-2 h-6 px-2 border-b border-border">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {title}
        </h2>
        {actions ? (
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
            {actions}
          </div>
        ) : null}
      </header>
      <div
        className={cn(
          "flex-1 min-h-0 min-w-0 p-2",
          scrollBody && "overflow-y-auto dashboard-pane-scroll",
          !scrollBody && "overflow-hidden flex flex-col",
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
