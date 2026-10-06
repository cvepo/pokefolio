import { NextResponse } from "next/server"
import { BASE_PATH } from "@/lib/base-path"

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  // Scoped to this app's sub-path, not "/".
  //
  // The app now shares www.enzohiu.com with the personal site, and a cookie at
  // "/" is sent on every request to that host — so a root-scoped cookie would
  // ship this value to an unrelated project on every page view. It is httpOnly,
  // so scripts cannot read it, but it would still land in that project's server
  // logs. Scoping it keeps the cookie to the app it authenticates.
  response.cookies.set("auth", password, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: BASE_PATH || "/",
  })
  return response
}
