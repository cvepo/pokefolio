import { describe, expect, it } from "vitest"
import { effectiveCategory, inferCategory } from "./categorize"

// Frozen catalog sample captured for Dashboard 2.0. It deliberately lives in
// source control so categorisation tests never depend on a live database.
const KNOWN_CATALOG: Array<[string, ReturnType<typeof inferCategory>]> = [
  ["Crown Zenith Booster Bundle", "Booster Bundle"],
  ["Sea & Sky Premium Collection", "Collection Box"],
  ["Blooming Waters Premium Collection", "Collection Box"],
  ["V Heroes Tin [Espeon V]", "Tin"],
  ["Scarlet & Violet Booster Box", "Booster Box"],
  ["Paldean Fates Elite Trainer Box", "ETB"],
]

describe("product categorisation", () => {
  it.each(KNOWN_CATALOG)("categorises known product %s", (name, category) => {
    expect(inferCategory(name)).toBe(category)
  })

  it.each([
    ["Surging Sparks Booster Display", "Booster Box"],
    ["Journey Together 6-Pack Booster Bundle", "Booster Bundle"],
    ["Pokémon Center Elite Trainer Box", "ETB"],
    ["Mini Tin", "Tin"],
    ["Three-Pack Blister", "Blister"],
    ["Premium Collection", "Collection Box"],
    ["Ultra-Premium Collection", "Specialty"],
    ["Build & Battle Stadium", "Specialty"],
    ["Single Sleeved Booster Pack", "Uncategorized"],
  ] as const)("handles naming convention %s", (name, category) => {
    expect(inferCategory(name)).toBe(category)
  })

  it("uses a manual override before inference", () => {
    expect(effectiveCategory("Odd Box", "Specialty")).toEqual({
      category: "Specialty",
      source: "override",
    })
  })
})
