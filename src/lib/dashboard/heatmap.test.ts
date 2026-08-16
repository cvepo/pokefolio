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
    const s = heatmapTileScale(320, 220)
    expect(s.nameFontPx).toBeGreaterThanOrEqual(14)
    expect(s.valueFontPx).toBeGreaterThanOrEqual(18)
    expect(s.metaFontPx).toBeGreaterThan(0)
    expect(s.imageSize).toBeGreaterThan(0)
  })

  it("scales type and image continuously with the tile, not in fixed jumps", () => {
    const big = heatmapTileScale(320, 220)
    const mid = heatmapTileScale(150, 110)
    const small = heatmapTileScale(110, 70)
    // Below the cap, each step down in width steps the figure down too.
    expect(mid.valueFontPx).toBeGreaterThan(small.valueFontPx)
    expect(big.imageSize).toBeGreaterThan(mid.imageSize)
    expect(mid.imageSize).toBeGreaterThan(0)
  })

  it("caps the money figure so a huge tile does not get absurd type", () => {
    // Past a point, more width should buy more name lines, not a 40px number.
    expect(heatmapTileScale(320, 220).valueFontPx).toBe(22)
    expect(heatmapTileScale(900, 400).valueFontPx).toBe(22)
  })

  it("gives taller tiles more name lines so the space is used", () => {
    const short = heatmapTileScale(200, 84)
    const tall = heatmapTileScale(200, 240)
    expect(tall.nameLines).toBeGreaterThan(short.nameLines)
  })

  it("keeps the money figure narrow enough to never clip", () => {
    // 10 chars at ~0.62em advance must fit the padded width.
    for (const w of [70, 100, 160, 240, 400]) {
      const s = heatmapTileScale(w, 120)
      expect(s.valueFontPx * 10 * 0.62).toBeLessThanOrEqual(w - 12 + 0.5)
    }
  })

  it("drops the percentage before the money figure", () => {
    const narrow = heatmapTileScale(72, 40)
    expect(narrow.changeFontPx).toBe(0)
    expect(narrow.valueFontPx).toBeGreaterThan(0)
  })

  it("drops the name before the money figure", () => {
    const tiny = heatmapTileScale(50, 24)
    expect(tiny.nameFontPx).toBe(0)
    expect(tiny.valueFontPx).toBeGreaterThan(0)
  })

  it("shows nothing at all when even a figure could not fit honestly", () => {
    const nano = heatmapTileScale(30, 14)
    expect(nano.valueFontPx).toBe(0)
    expect(nano.nameFontPx).toBe(0)
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

  it("points at our cutout route, not TCGplayer directly", () => {
    // Going straight to TCGplayer would put a solid white JPEG background on a
    // dark tile; the route serves a background-removed PNG instead.
    const url = heatmapImageUrl("123", 44)!
    expect(url).toContain("/api/product-image/123")
    expect(url).not.toContain("tcgplayer.com")
  })

  it("requests 2x the tile size so thumbnails stay sharp on retina", () => {
    expect(heatmapImageUrl("123", 40)).toContain("size=80")
  })

  it("clamps the requested size to the cached renditions", () => {
    expect(heatmapImageUrl("123", 10)).toContain("size=64")
    expect(heatmapImageUrl("123", 400)).toContain("size=256")
  })
})
