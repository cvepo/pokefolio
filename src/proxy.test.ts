import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"

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
