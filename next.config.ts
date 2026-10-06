import type { NextConfig } from "next"

/**
 * Pokéfolio is served at www.enzohiu.com/pokefolio, not at its own root.
 *
 * The personal site (github.com/cvepo/portfolio2) owns that domain and rewrites
 * /pokefolio/* to this deployment — the same arrangement RecruitingOS already
 * uses. `basePath` makes this app generate and expect that prefix.
 *
 * Note basePath is inlined at build time and only covers what Next controls:
 * next/link, the router, and static assets. Hand-written absolute strings —
 * `fetch("/api/...")`, an `<img src>` — are NOT rewritten, so those go through
 * `withBasePath` in src/lib/base-path.ts.
 */
const basePath = "/pokefolio"

const nextConfig: NextConfig = {
  basePath,
  // Exposed so client code can prefix the URLs Next does not touch.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
