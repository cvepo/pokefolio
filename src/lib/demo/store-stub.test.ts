import { describe, it, expect, beforeEach } from "vitest"
import { createDemoStoreStub } from "@/lib/demo/store-stub"
import { isDemoPath } from "@/proxy"

describe("isDemoPath", () => {
  it("allows exact /demo and nested paths", () => {
    expect(isDemoPath("/demo")).toBe(true)
    expect(isDemoPath("/demo/")).toBe(true)
    expect(isDemoPath("/demo/portfolios")).toBe(true)
  })

  it("rejects lookalike prefixes", () => {
    expect(isDemoPath("/demonstration")).toBe(false)
    expect(isDemoPath("/demo-admin")).toBe(false)
    expect(isDemoPath("/dashboard")).toBe(false)
  })
})

describe("createDemoStoreStub", () => {
  beforeEach(() => {
    // Each test gets a fresh store instance.
  })

  it("seeds portfolios and a dashboard payload", () => {
    const store = createDemoStoreStub()
    expect(store.getPortfolios().length).toBeGreaterThan(0)
    const envelope = store.getDashboard(undefined, "1M")
    expect(envelope.data.summary.positionCount).toBeGreaterThan(0)
    expect(store.state.dirty).toBe(false)
  })

  it("rejects oversell with an error message", () => {
    const store = createDemoStoreStub()
    const position = store.getDashboard("pf_main", "1M").data.positions.positions[0]
    expect(position).toBeTruthy()
    const result = store.addTransaction({
      portfolioId: "pf_main",
      productId: position.productId,
      type: "sell",
      quantity: position.quantity + 50,
      price: 10,
      date: store.today,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.toLowerCase()).toContain("cannot sell")
    expect(store.state.dirty).toBe(false)
  })

  it("marks dirty on buy and clears on reset", () => {
    const store = createDemoStoreStub()
    const catalogHit = store.searchProducts("Surging", 5)[0]
    expect(catalogHit).toBeTruthy()
    const before = store.getDashboard("pf_main", "1M").data.summary.unitCount
    const result = store.addTransaction({
      portfolioId: "pf_main",
      productId: catalogHit.id,
      type: "buy",
      quantity: 2,
      price: catalogHit.current_price ?? 50,
      date: store.today,
    })
    expect(result.ok).toBe(true)
    expect(store.state.dirty).toBe(true)
    const after = store.getDashboard("pf_main", "1M").data.summary.unitCount
    expect(after).toBe(before + 2)
    store.reset()
    expect(store.state.dirty).toBe(false)
    expect(store.getDashboard("pf_main", "1M").data.summary.unitCount).toBe(before)
  })
})
