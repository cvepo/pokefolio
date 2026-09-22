import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { DEMO_TCGPLAYER_IDS } from "@/lib/demo/catalog-ids"

const PUBLIC_PATHS = ["/login", "/api/auth/login"]

/** Exact `/demo` or anything under `/demo/` — not `/demonstration`, `/demo-admin`, etc. */
export function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/")
}

/**
 * Product thumbnails for the public demo.
 *
 * The images themselves are public product photos keyed by a numeric id, so
 * nothing here is sensitive. The reason this is an allowlist rather than an
 * open route is cost, not secrecy: a miss does real work (fetch, decode,
 * flood-fill, re-encode, upload), so an open endpoint would let anyone burn CPU
 * by walking id numbers. The demo's catalog is fixed at build time.
 */
function isDemoProductImagePath(pathname: string): boolean {
  const match = /^\/api\/product-image\/(\d+)$/.exec(pathname)
  return match ? DEMO_TCGPLAYER_IDS.has(match[1]) : false
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    isDemoPath(pathname) ||
    isDemoProductImagePath(pathname)
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/sync")) {
    const secret = process.env.CRON_SECRET
    // Vercel Cron cannot send custom headers — it authenticates with
    // `Authorization: Bearer $CRON_SECRET`. Only accepting `x-cron-secret`
    // meant every scheduled run was rejected here with a 401.
    if (secret) {
      const auth = request.headers.get("authorization")
      if (request.headers.get("x-cron-secret") === secret || auth === `Bearer ${secret}`) {
        return NextResponse.next()
      }
    }
    const cookie = request.cookies.get("auth")
    if (cookie?.value === process.env.ADMIN_PASSWORD) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminPassword = process.env.ADMIN_PASSWORD

  // Fail closed when no password is configured.
  //
  // The comparison below is `cookie?.value !== adminPassword`. With both sides
  // undefined that is false, so a missing ADMIN_PASSWORD silently turned every
  // gated route public — the opposite of what an auth gate should do when it is
  // misconfigured. A deploy with the variable unset now serves 401/redirect
  // rather than handing out the portfolio.
  if (!adminPassword) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const cookie = request.cookies.get("auth")
  if (cookie?.value !== adminPassword) {
    // API routes get a JSON 401 — redirecting an fetch() to an HTML login page
    // surfaces as an opaque JSON parse error in the client.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
