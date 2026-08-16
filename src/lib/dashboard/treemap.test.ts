import { describe, expect, it } from "vitest"
import { squarify, type TreemapInput } from "./treemap"

const W = 800
const H = 400

function totalArea(rects: Array<{ w: number; h: number }>): number {
  return rects.reduce((sum, r) => sum + r.w * r.h, 0)
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  const e = 0.001
  return a.x + a.w > b.x + e && b.x + b.w > a.x + e && a.y + a.h > b.y + e && b.y + b.h > a.y + e
}

describe("squarify", () => {
  const items: TreemapInput[] = [
    { id: "a", value: 6930 },
    { id: "b", value: 4122 },
    { id: "c", value: 3935 },
    { id: "d", value: 3346 },
    { id: "e", value: 2868 },
    { id: "f", value: 1240 },
    { id: "g", value: 945 },
    { id: "h", value: 693 },
    { id: "i", value: 338 },
  ]

  it("returns one rect per item", () => {
    expect(squarify(items, W, H)).toHaveLength(items.length)
  })

  it("fills the box exactly — no wasted space, no overflow", () => {
    const rects = squarify(items, W, H)
    expect(totalArea(rects)).toBeCloseTo(W * H, 3)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-0.001)
      expect(r.y).toBeGreaterThanOrEqual(-0.001)
      expect(r.x + r.w).toBeLessThanOrEqual(W + 0.001)
      expect(r.y + r.h).toBeLessThanOrEqual(H + 0.001)
    }
  })

  it("never overlaps tiles", () => {
    const rects = squarify(items, W, H)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j])).toBe(false)
      }
    }
  })

  it("makes area proportional to value — the whole point of PRD §15", () => {
    const rects = squarify(items, W, H)
    const byId = Object.fromEntries(rects.map((r) => [r.id, r.w * r.h]))
    const total = items.reduce((s, i) => s + i.value, 0)
    // 'a' is ~20x 'i' in value, so it must be ~20x in area — the flex-wrap
    // version clamped this to roughly 2x, which is the bug this replaces.
    expect(byId.a / byId.i).toBeGreaterThan(10)
    for (const item of items) {
      expect(byId[item.id] / (W * H)).toBeCloseTo(item.value / total, 2)
    }
  })

  it("keeps zero-value positions visible instead of dropping them", () => {
    // An unknown price means marketValue 0; PRD §12 forbids silently dropping it.
    const withZero: TreemapInput[] = [
      { id: "big", value: 10000 },
      { id: "unpriced", value: 0 },
    ]
    const rects = squarify(withZero, W, H)
    const unpriced = rects.find((r) => r.id === "unpriced")!
    expect(unpriced.w).toBeGreaterThan(0)
    expect(unpriced.h).toBeGreaterThan(0)
  })

  it("handles every value being zero without collapsing", () => {
    const rects = squarify([{ id: "x", value: 0 }, { id: "y", value: 0 }], W, H)
    expect(rects).toHaveLength(2)
    expect(totalArea(rects)).toBeCloseTo(W * H, 3)
  })

  it("returns nothing for a zero-sized box or no items", () => {
    expect(squarify(items, 0, H)).toEqual([])
    expect(squarify(items, W, 0)).toEqual([])
    expect(squarify([], W, H)).toEqual([])
  })

  it("handles a single item by filling the box", () => {
    const rects = squarify([{ id: "only", value: 5 }], W, H)
    expect(rects).toHaveLength(1)
    expect(rects[0].w).toBeCloseTo(W, 3)
    expect(rects[0].h).toBeCloseTo(H, 3)
  })

  it("produces reasonably square tiles rather than slivers", () => {
    const rects = squarify(items, W, H)
    const ratios = rects.map((r) => Math.max(r.w / r.h, r.h / r.w))
    // Squarification should keep the worst aspect ratio modest.
    expect(Math.max(...ratios)).toBeLessThan(6)
  })
})
