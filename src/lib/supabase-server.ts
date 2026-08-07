import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client.
 *
 * Every database query in this app runs inside a route handler or a lib module
 * called by one — the browser never talks to Supabase directly, it goes through
 * /api/*. That means we can use the service-role key here and lock the public
 * anon key out of the database entirely via RLS.
 *
 * NEVER import this from a "use client" module. Types live in @/lib/supabase,
 * which is safe to import anywhere.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/supabase-server was imported into client code. Import types from @/lib/supabase instead."
  )
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseUrl = rawUrl.startsWith("https://") ? rawUrl : "https://placeholder.supabase.co"

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/**
 * Which key we ended up using. Falls back to the anon key so that deploying
 * this change *before* setting SUPABASE_SERVICE_ROLE_KEY behaves exactly as it
 * does today rather than hard-failing. Enable RLS only once this reads
 * "service_role" — see supabase/migrations/004_enable_rls.sql.
 */
export const supabaseKeyMode: "service_role" | "anon" | "missing" = serviceKey
  ? "service_role"
  : anonKey
    ? "anon"
    : "missing"

/**
 * Which *kind* of service credential is configured — a label only, never the
 * value or any prefix of it.
 *
 * Exists so you can confirm which credential a deployment is actually holding
 * before revoking the legacy JWT signing key in Supabase. That revocation is
 * irreversible and kills every legacy HS256 key at once, so doing it while a
 * deployment still runs on `legacy_jwt` takes the app down with no way back
 * except issuing a fresh secret key.
 */
export const serviceKeyType: "sb_secret" | "legacy_jwt" | "unknown" | "none" = !serviceKey
  ? "none"
  : serviceKey.startsWith("sb_secret_")
    ? "sb_secret"
    : serviceKey.startsWith("eyJ") && serviceKey.split(".").length === 3
      ? "legacy_jwt"
      : "unknown"

if (supabaseKeyMode === "anon") {
  console.warn(
    "[supabase] SUPABASE_SERVICE_ROLE_KEY is not set — falling back to the anon key. " +
      "Do not enable RLS until this is configured, or every query will fail."
  )
}

export const supabase = createClient(
  supabaseUrl,
  serviceKey || anonKey || "placeholder_key",
  // The service role must never persist or refresh a session; it's a bare
  // server credential, not a logged-in user.
  { auth: { persistSession: false, autoRefreshToken: false } }
)
