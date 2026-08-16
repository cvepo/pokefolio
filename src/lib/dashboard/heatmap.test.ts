import { describe, expect, it } from "vitest"
import {
  HEATMAP_CLAMP,
  clampHeatmapChange,
  heatmapFillCss,
  heatmapNormalized,
  heatmapSizeWeight,
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

describe("heatmapSizeWeight", () => {
  it("floors empty/unknown value at 1", () => {
    expect(heatmapSizeWeight(0)).toBe(1)
    expect(heatmapSizeWeight(-10)).toBe(1)
  })

  it("scales with dollar value", () => {
    expect(heatmapSizeWeight(10_000_00)).toBeGreaterThan(heatmapSizeWeight(100_00))
  })
})
