import { describe, expect, it } from "vitest"
import {
  formatCents,
  formatSignedCents,
  formatUnknown,
  formatValueChangePair,
  formatValueChangePct,
  isPositiveChange,
} from "@/lib/dashboard/format"

describe("formatCents", () => {
  it("renders integer cents as dollars", () => {
    expect(formatCents(1234)).toBe("$12.34")
    expect(formatCents(0)).toBe("$0.00")
  })
})

describe("formatSignedCents", () => {
  it("prefixes gains and uses minus sign for losses", () => {
    expect(formatSignedCents(1250)).toBe("+$12.50")
    expect(formatSignedCents(-300)).toBe("−$3.00")
    expect(formatSignedCents(0)).toBe("$0.00")
  })
})

describe("formatValueChangePct", () => {
  it("formats fractions as percentage points", () => {
    expect(formatValueChangePct(0.0592)).toBe("+5.92%")
    expect(formatValueChangePct(-0.1465)).toBe("-14.65%")
  })

  it("never renders null as 0%", () => {
    expect(formatValueChangePct(null)).toBe("—")
    expect(formatValueChangePct(undefined)).toBe("—")
    expect(formatValueChangePct(0)).toBe("+0.00%")
  })
})

describe("formatValueChangePair", () => {
  it("joins abs and pct when both known", () => {
    expect(formatValueChangePair(455_240, 0.103)).toBe("+$4,552.40 / +10.30%")
  })

  it("keeps unknown sides explicit", () => {
    expect(formatValueChangePair(null, null)).toBe("—")
    expect(formatValueChangePair(null, 0.1)).toBe("— / +10.00%")
    expect(formatValueChangePair(100, null)).toBe("+$1.00 / —")
  })
})

describe("null is not zero", () => {
  it("exposes an explicit unknown token", () => {
    expect(formatUnknown()).toBe("—")
  })

  it("isPositiveChange returns null when unknown", () => {
    expect(isPositiveChange(null)).toBeNull()
    expect(isPositiveChange(0.01)).toBe(true)
    expect(isPositiveChange(-0.01)).toBe(false)
    expect(isPositiveChange(0)).toBe(true)
  })
})
