import { describe, expect, it, vi, afterEach } from "vitest"

async function freshModule(basePath: string | undefined) {
  vi.resetModules()
  if (basePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
  else process.env.NEXT_PUBLIC_BASE_PATH = basePath
  return import("./base-path")
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BASE_PATH
  vi.restoreAllMocks()
})

describe("withBasePath", () => {
  it("prefixes app-absolute paths when served under a sub-path", async () => {
    const { withBasePath } = await freshModule("/pokefolio")
    expect(withBasePath("/api/dashboard")).toBe("/pokefolio/api/dashboard")
    expect(withBasePath("/login")).toBe("/pokefolio/login")
  })

  it("is a no-op when served at the root", async () => {
    const { withBasePath } = await freshModule(undefined)
    expect(withBasePath("/api/dashboard")).toBe("/api/dashboard")
  })
})

describe("apiFetch", () => {
  it("sends app-absolute requests to the sub-path, not the domain root", async () => {
    // The domain root belongs to a different project, so an unprefixed
    // /api/... request leaves this app entirely and 404s.
    const { apiFetch } = await freshModule("/pokefolio")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    await apiFetch("/api/dashboard")
    expect(spy).toHaveBeenCalledWith("/pokefolio/api/dashboard", undefined)
  })

  it("leaves absolute external URLs alone", async () => {
    const { apiFetch } = await freshModule("/pokefolio")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    await apiFetch("https://example.com/thing")
    expect(spy).toHaveBeenCalledWith("https://example.com/thing", undefined)
  })

  it("passes init through unchanged", async () => {
    const { apiFetch } = await freshModule("/pokefolio")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
    const init = { method: "POST", body: "{}" }
    await apiFetch("/api/auth/login", init)
    expect(spy).toHaveBeenCalledWith("/pokefolio/api/auth/login", init)
  })
})
