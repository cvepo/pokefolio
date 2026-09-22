import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/api/auth/login"]

/** Exact `/demo` or anything under `/demo/` — not `/demonstration`, `/demo-admin`, etc. */
export function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/")
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || isDemoPath(pathname)) {
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

  const cookie = request.cookies.get("auth")
  if (cookie?.value !== process.env.ADMIN_PASSWORD) {
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
