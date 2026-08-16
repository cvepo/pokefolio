import { describe, expect, it } from "vitest"
import {
  HEATMAP_CLAMP,
  clampHeatmapChange,
  heatmapFillCss,
  heatmapImageUrl,
  heatmapNormalized,
  heatmapTileScale,
  heatmapTileState,
} from "@/lib/dashboard/heatmap"

describe("clampHeatmapChange", () => {
  it("clamps to ±25% by default", () => {
    expect(clampHeatmapChange(0.4)).toBe(HEATMAP_CLAMP)
    expect(clampHeatmapChange(-0.5)).toBe(-HEATMAP_CLAMP)
    expect(clampHeatmapChange(0.1)).toBe(0.1)
  })
})

describe("heatmapNormalized", () => {
  it("maps domain extremes to ±1", () => {
    expect(heatmapNormalized(0.25)).toBe(1)
    expect(heatmapNormalized(-0.25)).toBe(-1)
    expect(heatmapNormalized(0)).toBe(0)
  })

  it("clamps before normalizing", () => {
    expect(heatmapNormalized(0.5)).toBe(1)
    expect(heatmapNormalized(-1)).toBe(-1)
  })
})

describe("heatmapTileState", () => {
  it("marks missing 1M history as unknown, never as zero", () => {
    expect(heatmapTileState(null, "ok")).toBe("unknown")
  })

  it("marks unknown price as unknown", () => {
    expect(heatmapTileState(0.05, "unknown")).toBe("unknown")
  })

  it("marks stale price distinctly when history exists", () => {
    expect(heatmapTileState(0.05, "stale")).toBe("stale")
  })

  it("is normal for ok + known change", () => {
    expect(heatmapTileState(0, "ok")).toBe("normal")
  })
})

describe("heatmapFillCss", () => {
  it("returns distinct rgba for gain vs loss", () => {
    const up = heatmapFillCss(1)
    const down = heatmapFillCss(-1)
    expect(up).toContain("16, 185, 129")
    expect(down).toContain("239, 68, 68")
    expect(up).not.toBe(down)
  })
})


describe("heatmapTileScale", () => {
  it("gives large tiles large type and a thumbnail so they do not read as empty", () => {
    const s = heatmapTileScale(320, 200)
    expect(s.nameClass).toContain("13px")
    expect(s.valueClass).toContain("18px")
    expect(s.showMeta).toBe(true)
    expect(s.imageSize).toBeGreaterThan(0)
  })

  it("scales type down as the tile shrinks", () => {
    const big = heatmapTileScale(320, 200)
    const mid = heatmapTileScale(140, 90)
    const small = heatmapTileScale(100, 60)
    expect(big.imageSize).toBeGreaterThan(mid.imageSize)
    expect(mid.imageSize).toBeGreaterThan(small.imageSize)
    expect(small.showMeta).toBe(false)
  })

  it("drops the percentage before the money figure", () => {
    // The value is the load-bearing number; the change goes first.
    const narrow = heatmapTileScale(70, 40)
    expect(narrow.changeClass).toBeNull()
    expect(narrow.valueClass).not.toBeNull()
  })

  it("drops the name before the money figure", () => {
    const tiny = heatmapTileScale(50, 24)
    expect(tiny.nameClass).toBeNull()
    expect(tiny.valueClass).not.toBeNull()
  })

  it("shows nothing at all when even a figure could not fit honestly", () => {
    const nano = heatmapTileScale(30, 14)
    expect(nano.valueClass).toBeNull()
    expect(nano.nameClass).toBeNull()
    expect(nano.imageSize).toBe(0)
  })

  it("only offers an image once the tile is big enough to carry one", () => {
    expect(heatmapTileScale(100, 60).imageSize).toBe(0)
    expect(heatmapTileScale(140, 90).imageSize).toBeGreaterThan(0)
  })
})

describe("heatmapImageUrl", () => {
  it("returns null without a tcgplayer id or size", () => {
    expect(heatmapImageUrl(null, 44)).toBeNull()
    expect(heatmapImageUrl("123", 0)).toBeNull()
  })

  it("requests a larger source for larger thumbnails", () => {
    expect(heatmapImageUrl("123", 30)).toContain("64x64")
    expect(heatmapImageUrl("123", 44)).toContain("128x128")
    expect(heatmapImageUrl("123", 44)).toContain("/123.jpg")
  })
})
