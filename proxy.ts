import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/api/auth/login"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/sync")) {
    const secret = request.headers.get("x-cron-secret")
    if (secret === process.env.CRON_SECRET) {
      return NextResponse.next()
    }
    const cookie = request.cookies.get("auth")
    if (cookie?.value === process.env.ADMIN_PASSWORD) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cookie = request.cookies.get("auth")
  if (cookie?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
