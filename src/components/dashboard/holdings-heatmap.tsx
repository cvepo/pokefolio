"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Position, PositionsPayload } from "@/lib/dashboard/contract"
import { formatCents, formatValueChangePct } from "@/lib/dashboard/format"
import {
  heatmapFillCss,
  heatmapImageUrl,
  heatmapNormalized,
  heatmapTileScale,
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
  const observerRef = useRef<ResizeObserver | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  // The pane is sized by the viewport-locked grid, so its pixel box is only
  // known at runtime. Measure it rather than assuming, and keep the numbers
  // concrete — the same reason the value chart avoids percentage heights.
  //
  // Deliberately a callback ref rather than useEffect + useRef. The panel mounts
  // before the dashboard payload arrives, so on the first render this element
  // does not exist yet; an effect with [] deps would find a null ref, bail, and
  // never retry, leaving the treemap permanently measuring 0x0 and rendering
  // nothing. A callback ref fires whenever the node actually appears.
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

    // Measure immediately, before wiring the observer. Chrome defers
    // ResizeObserver callbacks while a tab is hidden, so relying on the observer
    // for the first measurement means a dashboard opened in a background tab
    // renders an entirely empty heatmap — and keeps it empty until something
    // happens to resize it. A synchronous read is always available.
    const initial = node.getBoundingClientRect()
    setBox({ width: Math.floor(initial.width), height: Math.floor(initial.height) })

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setBox({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

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
        <div ref={attachContainer} className="relative w-full h-full min-h-0 min-w-0">
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
  const [imageFailed, setImageFailed] = useState(false)
  const change1M = position.valueChangePct["1M"]
  const state = heatmapTileState(change1M, position.priceStatus)
  const isUnknown = state === "unknown"
  const fill =
    !isUnknown && change1M != null
      ? heatmapFillCss(heatmapNormalized(change1M, domainMin, domainMax))
      : undefined

  const width = Math.max(0, rect.w - TILE_GAP)
  const height = Math.max(0, rect.h - TILE_GAP)
  const scale = heatmapTileScale(width, height)
  const imageUrl = imageFailed
    ? null
    : heatmapImageUrl(position.tcgplayerId, scale.imageSize)

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
        "overflow-hidden rounded-sm border px-1.5 py-1 flex flex-col justify-between gap-0.5",
        isUnknown
          ? "border-border bg-[repeating-linear-gradient(-45deg,hsl(var(--muted)),hsl(var(--muted))_6px,hsl(var(--card))_6px,hsl(var(--card))_12px)]"
          : "border-border/80",
        state === "stale" && "ring-1 ring-inset ring-amber-500/60"
      )}
    >
      {scale.nameClass && (
        <div className="flex items-start justify-between gap-1.5 min-w-0">
          <div className="min-w-0 flex-1">
            <p
              className={cn("font-medium", scale.nameClass)}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: scale.nameLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {position.name}
            </p>
            {scale.showMeta && (
              <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                {position.quantity} units · {position.setName}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {state === "stale" && (
              <span className="text-[8px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1 rounded-sm">
                Stale
              </span>
            )}
            {position.priceStatus === "unknown" && (
              <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-1 rounded-sm">
                No price
              </span>
            )}
            {imageUrl && (
              // Product shots are JPEGs on a white background. Sitting them on a
              // white chip makes that background read as part of the thumbnail
              // instead of a pasted rectangle; multiply hides the antialiased seam.
              <span
                className="rounded-sm bg-white overflow-hidden flex items-center justify-center"
                style={{ width: scale.imageSize, height: scale.imageSize }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  onError={() => setImageFailed(true)}
                  className="w-full h-full object-contain mix-blend-multiply"
                />
              </span>
            )}
          </div>
        </div>
      )}

      {scale.valueClass && (
        <div className="flex items-end justify-between gap-1.5 min-w-0 mt-auto">
          {/* Never truncated: a clipped "$1,420.…" reads as a real number while
              being wrong. The percentage is dropped first, then the name. */}
          <span className={cn("font-semibold tabular-nums whitespace-nowrap", scale.valueClass)}>
            {position.priceStatus === "unknown" ? "—" : formatCents(position.marketValue)}
          </span>
          {scale.changeClass && (
            <span
              className={cn(
                "font-semibold tabular-nums whitespace-nowrap shrink-0",
                scale.changeClass,
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
