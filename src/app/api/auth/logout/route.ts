import { NextResponse } from "next/server"
import { BASE_PATH } from "@/lib/base-path"

export async function POST() {
  const response = NextResponse.json({ ok: true })
  // Must match the path the cookie was set with, or the browser keeps it.
  response.cookies.set("auth", "", { maxAge: 0, path: BASE_PATH || "/" })
  return response
}
