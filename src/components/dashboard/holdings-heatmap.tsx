"use client"

import { useEffect, useRef, useState } from "react"
import type { Position, PositionsPayload } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import {
  heatmapFillCss,
  heatmapNormalized,
  heatmapTileState,
} from "@/lib/dashboard/heatmap"
import { squarify } from "@/lib/dashboard/treemap"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

type HoldingsHeatmapProps = {
  positions: PositionsPayload
}

/** Gap between tiles, in px. Applied as an inset so rects never overlap. */
const TILE_GAP = 2

/**
 * Size = market value, colour = 1M per-unit Value Change clamped ±25% (PRD §15).
 *
 * Laid out as a squarified treemap rather than a wrapping flex grid. Tiles
 * previously carried a 64-140px width clamp, which meant a position worth 20x
 * another rendered barely 2x wider — the size encoding the PRD asks for was
 * effectively absent, and min-widths also pushed the last tile of each row past
 * the pane edge where it was clipped mid-number.
 *
 * Stale / unknown / no-history stay visually distinct — never colour-alone.
 */
export function HoldingsHeatmap({ positions }: HoldingsHeatmapProps) {
  const { min, max } = positions.heatmapColorDomain
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  // The pane is sized by the viewport-locked grid, so its pixel box is only
  // known at runtime. Measure it rather than assuming, and keep the numbers
  // concrete — the same reason the value chart avoids percentage heights.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setBox({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const byId = new Map(positions.positions.map((p) => [p.productId, p]))
  const rects =
    box.width > 0 && box.height > 0
      ? squarify(
          positions.positions.map((p) => ({ id: p.productId, value: p.marketValue })),
          box.width,
          box.height
        )
      : []

  return (
    <DashboardPanel title="Holdings heatmap" actions={<HeatmapLegend />} bodyClassName="!p-1.5">
      {positions.positions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-sm">
          No open positions.
        </p>
      ) : (
        <div ref={containerRef} className="relative w-full h-full min-h-0 min-w-0">
          {rects.map((rect) => {
            const position = byId.get(rect.id)
            if (!position) return null
            return (
              <HeatmapTile
                key={rect.id}
                position={position}
                domainMin={min}
                domainMax={max}
                rect={rect}
              />
            )
          })}
        </div>
      )}
    </DashboardPanel>
  )
}

function HeatmapTile({
  position,
  domainMin,
  domainMax,
  rect,
}: {
  position: Position
  domainMin: number
  domainMax: number
  rect: { x: number; y: number; w: number; h: number }
}) {
  const change1M = position.valueChangePct["1M"]
  const state = heatmapTileState(change1M, position.priceStatus)
  const isUnknown = state === "unknown"
  const fill =
    !isUnknown && change1M != null
      ? heatmapFillCss(heatmapNormalized(change1M, domainMin, domainMax))
      : undefined

  const width = Math.max(0, rect.w - TILE_GAP)
  const height = Math.max(0, rect.h - TILE_GAP)

  // Drop content progressively rather than letting it overflow or clip. The
  // tooltip always carries the full detail (PRD §15), so a small tile loses
  // nothing that isn't recoverable on hover.
  const showName = width >= 84 && height >= 46
  const showFigures = width >= 52 && height >= 26
  const showChange = width >= 74 && height >= 26

  const title = [
    position.name,
    `${position.quantity} units`,
    `Value ${formatCents(position.marketValue)}`,
    `1M Value Change ${formatValueChangePct(change1M)}`,
    position.priceStatus !== "ok" ? `Price: ${position.priceStatus}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      title={title}
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width,
        height,
        background: isUnknown ? undefined : fill,
      }}
      className={cn(
        "overflow-hidden rounded-sm border px-1 py-0.5 flex flex-col justify-between",
        isUnknown
          ? "border-border bg-[repeating-linear-gradient(-45deg,hsl(var(--muted)),hsl(var(--muted))_6px,hsl(var(--card))_6px,hsl(var(--card))_12px)]"
          : "border-border/80",
        state === "stale" && "ring-1 ring-inset ring-amber-500/60"
      )}
    >
      {showName && (
        <div className="flex items-start justify-between gap-1 min-w-0">
          <p className="text-[10px] font-medium leading-tight line-clamp-2 min-w-0">
            {position.name}
          </p>
          {state === "stale" && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1 rounded-sm">
              Stale
            </span>
          )}
          {position.priceStatus === "unknown" && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-1 rounded-sm">
              No price
            </span>
          )}
        </div>
      )}

      {showFigures && (
        <div className="flex items-end justify-between gap-1 min-w-0 mt-auto">
          <span className="text-[11px] font-semibold tabular-nums truncate">
            {position.priceStatus === "unknown" ? "—" : formatCents(position.marketValue)}
          </span>
          {showChange && (
            <span
              className={cn(
                "text-[10px] font-semibold tabular-nums shrink-0",
                change1M == null && "text-muted-foreground",
                change1M != null && change1M >= 0 && "text-emerald-600 dark:text-emerald-400",
                change1M != null && change1M < 0 && "text-red-600 dark:text-red-400"
              )}
            >
              {change1M == null ? (
                <span className="inline-flex items-center gap-0.5">
                  <span aria-hidden>⌀</span> Unk
                </span>
              ) : (
                formatValueChangePct(change1M)
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap justify-end">
      <span className="inline-flex items-center gap-0.5">
        <span className="w-2 h-2 rounded-sm bg-emerald-500/50" aria-hidden /> Gain
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="w-2 h-2 rounded-sm bg-red-500/50" aria-hidden /> Loss
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span
          className="w-2 h-2 rounded-sm border border-border bg-[repeating-linear-gradient(-45deg,#8883_0_2px,transparent_2px_4px)]"
          aria-hidden
        />{" "}
        Unknown
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="text-[8px] font-bold uppercase text-amber-700 dark:text-amber-300 bg-amber-500/15 px-0.5 rounded-sm">
          Stale
        </span>
      </span>
      <span className="text-[9px] opacity-70">· size = value</span>
    </div>
  )
}
