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
import { squarify, type TreemapRect } from "@/lib/dashboard/treemap"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

type HoldingsHeatmapProps = {
  positions: PositionsPayload
}

/** Gap between tiles, in px. Applied as an inset so rects never overlap. */
const TILE_GAP = 2

const HOVER_CARD_WIDTH = 236

type HoverState = { productId: string; x: number; y: number }

/**
 * Size = market value, colour = 1M per-unit Value Change clamped ±25% (PRD §15).
 *
 * Laid out as a squarified treemap so area is proportional to value and the
 * pane is filled exactly. Type scales continuously with each tile, and a hover
 * card carries the full detail — including the untruncated product name, which
 * no tile is guaranteed to have room for.
 *
 * Stale / unknown / no-history stay visually distinct — never colour-alone.
 */
export function HoldingsHeatmap({ positions }: HoldingsHeatmapProps) {
  const { min, max } = positions.heatmapColorDomain
  const observerRef = useRef<ResizeObserver | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<HoverState | null>(null)

  // The pane is sized by the viewport-locked grid, so its pixel box is only
  // known at runtime.
  //
  // Deliberately a callback ref rather than useEffect + useRef: the panel mounts
  // before the dashboard payload arrives, so on first render this element does
  // not exist and an effect with [] deps would bail and never retry. The
  // synchronous measurement matters too — Chrome defers ResizeObserver
  // callbacks in hidden tabs, so waiting for one leaves a dashboard opened in a
  // background tab with a permanently empty heatmap.
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

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
  const rects: TreemapRect[] =
    box.width > 0 && box.height > 0
      ? squarify(
          positions.positions.map((p) => ({ id: p.productId, value: p.marketValue })),
          box.width,
          box.height
        )
      : []

  const hovered = hover ? byId.get(hover.productId) : null

  return (
    <DashboardPanel title="Holdings heatmap" actions={<HeatmapLegend />} bodyClassName="!p-1.5">
      {positions.positions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-sm">
          No open positions.
        </p>
      ) : (
        <div
          ref={attachContainer}
          className="relative w-full h-full min-h-0 min-w-0"
          onMouseLeave={() => setHover(null)}
        >
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
                dimmed={hover != null && hover.productId !== rect.id}
                onHover={(x, y) => setHover({ productId: rect.id, x, y })}
              />
            )
          })}

          {hovered && hover && (
            <HeatmapHoverCard
              position={hovered}
              x={hover.x}
              y={hover.y}
              bounds={box}
            />
          )}
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
  dimmed,
  onHover,
}: {
  position: Position
  domainMin: number
  domainMax: number
  rect: TreemapRect
  dimmed: boolean
  onHover: (x: number, y: number) => void
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
  const imageUrl = imageFailed ? null : heatmapImageUrl(position.tcgplayerId, scale.imageSize)

  return (
    <div
      onMouseEnter={(e) => onHover(rect.x + e.nativeEvent.offsetX, rect.y + e.nativeEvent.offsetY)}
      onMouseMove={(e) => onHover(rect.x + e.nativeEvent.offsetX, rect.y + e.nativeEvent.offsetY)}
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width,
        height,
        background: isUnknown ? undefined : fill,
      }}
      className={cn(
        "overflow-hidden rounded-sm border px-1.5 py-1 flex flex-col justify-between gap-0.5 transition-opacity",
        isUnknown
          ? "border-border bg-[repeating-linear-gradient(-45deg,hsl(var(--muted)),hsl(var(--muted))_6px,hsl(var(--card))_6px,hsl(var(--card))_12px)]"
          : "border-border/80",
        state === "stale" && "ring-1 ring-inset ring-amber-500/60",
        dimmed ? "opacity-55" : "opacity-100"
      )}
    >
      {scale.nameFontPx > 0 && (
        <div className="flex items-start justify-between gap-1.5 min-w-0">
          <div className="min-w-0 flex-1">
            <p
              className="font-medium"
              style={{
                fontSize: scale.nameFontPx,
                lineHeight: 1.2,
                display: "-webkit-box",
                WebkitLineClamp: scale.nameLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {position.name}
            </p>
            {scale.metaFontPx > 0 && (
              <p
                className="text-muted-foreground truncate mt-0.5"
                style={{ fontSize: scale.metaFontPx }}
              >
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
              <ProductThumb
                url={imageUrl}
                size={scale.imageSize}
                onError={() => setImageFailed(true)}
              />
            )}
          </div>
        </div>
      )}

      {scale.valueFontPx > 0 && (
        <div className="flex items-end justify-between gap-1.5 min-w-0 mt-auto">
          {/* Never truncated — the percentage and name are dropped first. */}
          <span
            className="font-semibold tabular-nums whitespace-nowrap"
            style={{ fontSize: scale.valueFontPx, lineHeight: 1 }}
          >
            {position.priceStatus === "unknown" ? "—" : formatCents(position.marketValue)}
          </span>
          {scale.changeFontPx > 0 && (
            <span
              className={cn(
                "font-semibold tabular-nums whitespace-nowrap shrink-0",
                change1M == null && "text-muted-foreground",
                change1M != null && change1M >= 0 && "text-emerald-600 dark:text-emerald-400",
                change1M != null && change1M < 0 && "text-red-600 dark:text-red-400"
              )}
              style={{ fontSize: scale.changeFontPx, lineHeight: 1 }}
            >
              {change1M == null ? "⌀" : formatValueChangePct(change1M)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Product thumbnail. The image arrives from /api/product-image with its white
 * studio background already cut out, so it needs no chip or blend mode behind
 * it — it sits directly on the tile colour.
 */
function ProductThumb({
  url,
  size,
  onError,
}: {
  url: string
  size: number
  onError: () => void
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      aria-hidden
      onError={onError}
      /* Not lazy: the dashboard is locked to one viewport, so every tile is on
         screen from the start and deferring only delays the paint. */
      decoding="async"
      width={size}
      height={size}
      className="object-contain drop-shadow-sm"
      style={{ width: size, height: size }}
    />
  )
}

/**
 * Hover detail, replacing the browser's native `title` tooltip.
 *
 * The native one is slow to appear, unstyled, and cannot be read at a glance —
 * and a tile is never guaranteed room for the full product name, so there has
 * to be somewhere the untruncated name is always available (PRD §15 requires
 * name, units, value and change on hover).
 */
function HeatmapHoverCard({
  position,
  x,
  y,
  bounds,
}: {
  position: Position
  x: number
  y: number
  bounds: { width: number; height: number }
}) {
  const change1M = position.valueChangePct["1M"]

  // Flip toward whichever side has room so the card never leaves the pane.
  const left = Math.min(Math.max(0, x + 14), Math.max(0, bounds.width - HOVER_CARD_WIDTH))
  const flipUp = y > bounds.height / 2
  const style: React.CSSProperties = {
    position: "absolute",
    left,
    width: HOVER_CARD_WIDTH,
    ...(flipUp ? { bottom: Math.max(0, bounds.height - y + 14) } : { top: y + 14 }),
  }

  return (
    <div
      style={style}
      className="z-20 pointer-events-none rounded-sm border border-border bg-card/98 backdrop-blur-sm shadow-lg px-2.5 py-2 space-y-1.5"
    >
      <p className="text-[12px] font-semibold leading-snug">{position.name}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">
        {position.setName} · {position.category}
      </p>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] pt-1 border-t border-border">
        <HoverRow label="Units" value={`${position.quantity}`} />
        <HoverRow label="Value" value={formatCents(position.marketValue)} />
        <HoverRow label="Avg cost" value={formatCents(position.avgUnitCost)} />
        <HoverRow
          label="Unit price"
          value={
            position.currentUnitPrice == null ? "—" : formatCents(position.currentUnitPrice)
          }
        />
        <HoverRow
          label="1M change"
          value={change1M == null ? "Unknown" : formatValueChangePct(change1M)}
          tone={change1M == null ? "muted" : change1M >= 0 ? "up" : "down"}
        />
        <HoverRow label="Signal" value={position.signal} />
      </dl>

      {position.priceStatus !== "ok" && (
        <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 pt-1 border-t border-border">
          {position.priceStatus === "stale"
            ? "Stale price — last known good, not current"
            : "No price recorded for this product"}
        </p>
      )}
    </div>
  )
}

function HoverRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "muted" | "up" | "down"
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right tabular-nums font-medium",
          tone === "muted" && "text-muted-foreground",
          tone === "up" && "text-emerald-600 dark:text-emerald-400",
          tone === "down" && "text-red-600 dark:text-red-400"
        )}
      >
        {value}
      </dd>
    </>
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
