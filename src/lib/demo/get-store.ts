/**
 * Resolves the demo store used by every `/demo` page.
 *
 * A singleton so every demo page in a tab shares one sandbox — navigating from
 * Search to the portfolio must show the purchase you just added, not a fresh
 * seeded copy.
 */

import type { DemoStore } from "@/lib/demo/contract"
import { createDemoStore } from "@/lib/demo/store"

let singleton: DemoStore | null = null

export function getDemoStore(): DemoStore {
  if (!singleton) {
    singleton = createDemoStore()
  }
  return singleton
}

/** Test helper — drop the singleton so the next getDemoStore() is fresh. */
export function __resetDemoStoreSingleton(): void {
  singleton = null
}
