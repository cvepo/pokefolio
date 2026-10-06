/**
 * The sub-path this app is served under (see next.config.ts).
 *
 * Next applies `basePath` to next/link, the router and static assets, but not
 * to absolute URL strings written by hand. A `fetch("/api/dashboard")` from the
 * browser would resolve against the domain root — which belongs to the personal
 * site, not to this app — and 404. Everything built as a string goes through
 * here instead.
 *
 * Empty in dev when unset, so the app still works when served at the root.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

/** Prefix an app-absolute path with the base path. */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path
  if (!path.startsWith("/")) return `${BASE_PATH}/${path}`
  return `${BASE_PATH}${path}`
}

/**
 * `fetch`, with the base path applied to app-absolute URLs.
 *
 * A drop-in for `fetch` at call sites that hit this app's own API. External
 * URLs and relative paths pass through untouched.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = input.startsWith("/") ? withBasePath(input) : input
  return fetch(url, init)
}
