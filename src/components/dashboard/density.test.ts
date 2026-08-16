import { describe, expect, it } from "vitest"
import { INSIGHT_DISPLAY_CAP } from "@/lib/dashboard/insights"
import {
  chartHeightForWidth,
  densityTierForWidth,
  insightDisplayCapForWidth,
} from "@/components/dashboard/density"

describe("densityTierForWidth", () => {
  it("maps width bands to tiers", () => {
    expect(densityTierForWidth(1024)).toBe("base")
    expect(densityTierForWidth(1279)).toBe("base")
    expect(densityTierForWidth(1280)).toBe("xl")
    expect(densityTierForWidth(1919)).toBe("xl")
    expect(densityTierForWidth(1920)).toBe("3xl")
    expect(densityTierForWidth(2399)).toBe("3xl")
    expect(densityTierForWidth(2400)).toBe("4xl")
  })
})

describe("chartHeightForWidth", () => {
  it("returns concrete pixel heights per tier", () => {
    expect(chartHeightForWidth(1280)).toBe(280)
    expect(chartHeightForWidth(1920)).toBe(340)
    expect(chartHeightForWidth(2400)).toBe(400)
  })
})

describe("insightDisplayCapForWidth", () => {
  it("raises the display cap at 3xl/4xl without changing the base default", () => {
    expect(insightDisplayCapForWidth(1280)).toBe(INSIGHT_DISPLAY_CAP)
    expect(insightDisplayCapForWidth(1920)).toBe(8)
    expect(insightDisplayCapForWidth(2400)).toBe(12)
  })
})
