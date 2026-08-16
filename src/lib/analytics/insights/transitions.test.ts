import { describe, expect, it } from "vitest"
import { signalTransition } from "./signal-transition"
import { outsizedMoveTransition } from "./outsized-move"
import { concentrationTransition } from "./concentration"
import { insightSeverity } from "./severity"

describe("insight transitions", () => {
  it("emits once for A → B, none for B → B, and once for B → A", () => {
    expect(signalTransition("Cooling", "Declining")).toMatchObject({ fromSignal: "Cooling", toSignal: "Declining" })
    expect(signalTransition("Declining", "Declining")).toBeNull()
    expect(signalTransition("Declining", "Cooling")).toMatchObject({ fromSignal: "Declining", toSignal: "Cooling" })
  })

  it("does not emit first or insufficient-data observations", () => {
    expect(signalTransition(null, "Cooling")).toBeNull()
    expect(signalTransition("Insufficient data", "Cooling")).toBeNull()
    expect(signalTransition("Cooling", "Insufficient data")).toBeNull()
  })

  it("does not duplicate identical outsized input", () => {
    expect(outsizedMoveTransition("NORMAL", 0.11)?.toState).toBe("OUTSIZED_UP")
    expect(outsizedMoveTransition("OUTSIZED_UP", 0.11)).toBeNull()
    expect(outsizedMoveTransition("OUTSIZED_UP", 0.05)?.toState).toBe("NORMAL")
  })

  it("implements concentration crossing and re-crossing", () => {
    expect(concentrationTransition(false, 0.2)?.resolved).toBe(false)
    expect(concentrationTransition(true, 0.25)).toBeNull()
    expect(concentrationTransition(true, 0.19)?.resolved).toBe(true)
    expect(concentrationTransition(false, 0.21)?.resolved).toBe(false)
  })

  it("scores larger moves above smaller moves of the same kind", () => {
    const payload = { kind: "outsized_move", direction: "down", timeframe: "1M", fromState: "NORMAL", toState: "OUTSIZED_DOWN" } as const
    expect(insightSeverity({ ...payload, movePct: -0.4 })).toBeGreaterThan(insightSeverity({ ...payload, movePct: -0.11 }))
  })
})
