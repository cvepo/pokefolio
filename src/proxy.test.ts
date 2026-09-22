import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"
import { DEMO_TCGPLAYER_IDS } from "@/lib/demo/catalog-ids"

const PASSWORD = "test-admin-password"

function request(path: string, opts: { cookie?: string; headers?: Record<string, string> } = {}) {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`), {
    headers: opts.headers,
  })
  if (opts.cookie) req.cookies.set("auth", opts.cookie)
  return req
}

describe("proxy auth", () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD
    delete process.env.CRON_SECRET
  })
  afterEach(() => {
    process.env = { ...original }
  })

  // PRD §10 test 24. An HTML redirect here surfaces in the client as an opaque
  // JSON parse error rather than an auth failure, so the status and the body
  // shape both matter.
  it("24. unauthenticated /api/compare/series returns 401 JSON, not a redirect", async () => {
    const res = proxy(request("/api/compare/series"))

    expect(res.status).toBe(401)
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("content-type")).toContain("application/json")
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("24a. authenticated /api/compare/series passes through", () => {
    const res = proxy(request("/api/compare/series", { cookie: PASSWORD }))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("24b. a wrong password is rejected the same way", async () => {
    const res = proxy(request("/api/compare/series", { cookie: "wrong" }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("24c. /compare is covered by the matcher and is NOT in PUBLIC_PATHS", () => {
    // Page routes still redirect to the login screen — only /api/* gets JSON.
    const res = proxy(request("/compare"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/login")
  })

  it("24d. unauthenticated page requests redirect rather than 401", () => {
    expect(proxy(request("/dashboard")).status).toBe(307)
  })

  it("24e. the login route stays public", () => {
    expect(proxy(request("/login")).headers.get("x-middleware-next")).toBe("1")
  })

  it("demo: /demo is public without a cookie", () => {
    const res = proxy(request("/demo"))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("demo: /demo/portfolios is public without a cookie", () => {
    const res = proxy(request("/demo/portfolios"))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("demo: a /demo prefix alone does not open /demonstration", () => {
    const res = proxy(request("/demonstration"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/login")
  })

  it("demo: /api/dashboard stays 401 JSON without a cookie", async () => {
    const res = proxy(request("/api/dashboard"))
    expect(res.status).toBe(401)
    expect(res.headers.get("location")).toBeNull()
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("demo: /dashboard still redirects to login without a cookie", () => {
    const res = proxy(request("/dashboard"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/login")
  })
})

describe("demo product images", () => {
  const original = { ...process.env }
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD
    delete process.env.CRON_SECRET
  })
  afterEach(() => {
    process.env = { ...original }
  })

  it("allows an image id that is in the demo catalog", () => {
    const id = [...DEMO_TCGPLAYER_IDS][0]
    const res = proxy(request(`/api/product-image/${id}`))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("still gates an image id that is not in the demo catalog", () => {
    // Bounded on purpose: a miss does real CPU work, so an open route would let
    // anyone burn compute by walking id numbers.
    const res = proxy(request("/api/product-image/999999999"))
    expect(res.status).toBe(401)
  })

  it("does not open the rest of the image route surface", () => {
    expect(proxy(request("/api/product-image")).status).toBe(401)
    expect(proxy(request("/api/product-image/abc")).status).toBe(401)
    expect(proxy(request("/api/product-image/1/../../dashboard")).status).toBe(401)
  })
})

describe("proxy fails closed when misconfigured", () => {
  const original = { ...process.env }
  beforeEach(() => {
    delete process.env.ADMIN_PASSWORD
    delete process.env.CRON_SECRET
  })
  afterEach(() => {
    process.env = { ...original }
  })

  it("does not serve the app when ADMIN_PASSWORD is unset", () => {
    // Previously `cookie?.value !== process.env.ADMIN_PASSWORD` compared
    // undefined to undefined, so a missing password opened every route.
    expect(proxy(request("/dashboard")).status).toBe(307)
    expect(proxy(request("/api/dashboard")).status).toBe(401)
    expect(proxy(request("/portfolios")).status).toBe(307)
  })

  it("does not accept a guessed cookie when no password is configured", () => {
    expect(proxy(request("/dashboard", { cookie: "anything" })).status).toBe(307)
  })

  it("still serves the public demo and login when misconfigured", () => {
    expect(proxy(request("/demo")).status).toBe(200)
    expect(proxy(request("/login")).status).toBe(200)
  })
})
