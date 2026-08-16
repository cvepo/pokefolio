/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 *
 * PRD §15 defines the holdings heatmap as `size = current market value`. A
 * flex-wrap grid cannot express that: once tiles carry a min and max width, a
 * 20× difference in value collapses to a ~2× difference in width and the
 * encoding stops meaning anything. A treemap gives each position an *area*
 * proportional to its value and fills the pane exactly, which is also what
 * real market heatmaps do.
 *
 * "Squarified" means the algorithm greedily picks rows that keep tiles close to
 * square, because long thin slivers are hard to compare by area and hard to
 * label.
 *
 * Pure and dependency-free so it can be unit-tested without a DOM.
 */

export type TreemapInput = {
  id: string
  /** Must be ≥ 0. Zero-value items are floored — see `squarify`. */
  value: number
}

export type TreemapRect = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * Positions with an unknown price have a market value of 0 and would get zero
 * area — i.e. vanish. PRD §12/§15 are explicit that a missing price must never
 * silently drop a position, so tiny values are floored to this fraction of the
 * total so they stay visible and legible as an explicit Unknown tile.
 */
const MIN_AREA_SHARE = 0.005

type Rect = { x: number; y: number; w: number; h: number }

/** Worst (largest) aspect ratio in `row` if laid along `side`. Lower is better. */
function worstAspect(row: number[], side: number): number {
  if (row.length === 0) return Infinity
  let sum = 0
  let min = Infinity
  let max = 0
  for (const area of row) {
    sum += area
    if (area < min) min = area
    if (area > max) max = area
  }
  if (sum <= 0 || side <= 0) return Infinity
  const side2 = side * side
  const sum2 = sum * sum
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min))
}

/** Place one completed row along the short edge and shrink the free rectangle. */
function layoutRow(
  row: Array<{ id: string; area: number }>,
  free: Rect,
  out: TreemapRect[]
): void {
  const total = row.reduce((sum, item) => sum + item.area, 0)
  if (total <= 0) return

  if (free.w >= free.h) {
    // Stack vertically in a column on the left.
    const colWidth = free.h > 0 ? total / free.h : 0
    let y = free.y
    for (const item of row) {
      const h = colWidth > 0 ? item.area / colWidth : 0
      out.push({ id: item.id, x: free.x, y, w: colWidth, h })
      y += h
    }
    free.x += colWidth
    free.w -= colWidth
  } else {
    // Lay out horizontally in a band across the top.
    const rowHeight = free.w > 0 ? total / free.w : 0
    let x = free.x
    for (const item of row) {
      const w = rowHeight > 0 ? item.area / rowHeight : 0
      out.push({ id: item.id, x, y: free.y, w, h: rowHeight })
      x += w
    }
    free.y += rowHeight
    free.h -= rowHeight
  }
}

/**
 * Lay `items` out inside a `width` × `height` box.
 *
 * Rects never overlap and never exceed the box, so the caller can position them
 * absolutely without clipping — the overflow bug a flex-wrap grid produces when
 * min-widths stop tiles shrinking.
 */
export function squarify(
  items: TreemapInput[],
  width: number,
  height: number
): TreemapRect[] {
  if (width <= 0 || height <= 0 || items.length === 0) return []

  // Largest first — squarification depends on descending order.
  const sorted = [...items].sort((a, b) => b.value - a.value)

  const rawTotal = sorted.reduce((sum, item) => sum + Math.max(0, item.value), 0)
  // Everything is zero (e.g. nothing priced yet): fall back to equal shares so
  // the positions still appear rather than collapsing to nothing.
  const floorValue = rawTotal > 0 ? rawTotal * MIN_AREA_SHARE : 1
  const values = sorted.map((item) => Math.max(item.value, floorValue))
  const total = values.reduce((sum, v) => sum + v, 0)

  const boxArea = width * height
  const areas = values.map((v) => (v / total) * boxArea)

  const out: TreemapRect[] = []
  const free: Rect = { x: 0, y: 0, w: width, h: height }

  let row: Array<{ id: string; area: number }> = []
  let index = 0

  while (index < areas.length) {
    const side = Math.min(free.w, free.h)
    const candidate = { id: sorted[index].id, area: areas[index] }
    const current = row.map((item) => item.area)
    const extended = [...current, candidate.area]

    // Keep adding while the row's worst aspect ratio improves (or is unset).
    if (row.length === 0 || worstAspect(extended, side) <= worstAspect(current, side)) {
      row.push(candidate)
      index += 1
    } else {
      layoutRow(row, free, out)
      row = []
    }
  }

  if (row.length > 0) layoutRow(row, free, out)

  return out
}
