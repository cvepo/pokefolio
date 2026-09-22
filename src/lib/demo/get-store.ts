/**
 * Resolves the demo store used by every `/demo` page.
 *
 * Prefer the real `createDemoStore` from `./store` when the data-layer branch
 * has merged. Until then, fall back to the temporary stub.
 *
 * TEMPORARY: delete the stub import path at integration (one-line change).
 */

import type { DemoStore } from "@/lib/demo/contract"
import { createDemoStoreStub } from "@/lib/demo/store-stub"

let singleton: DemoStore | null = null

function tryCreateRealStore(): DemoStore | null {
  try {
    // Dynamic require so a missing `./store` at build time does not fail the
    // UI worktree. Webpack/Turbopack still need the module to exist for a
    // static import — so we only attempt this after merge when store.ts lands.
    // Until then, always use the stub.
    //
    // At integration: replace the body with:
    //   const { createDemoStore } = require("./store")
    //   return createDemoStore()
    return null
  } catch {
    return null
  }
}

export function getDemoStore(): DemoStore {
  if (!singleton) {
    singleton = tryCreateRealStore() ?? createDemoStoreStub()
  }
  return singleton
}

/** Test helper — drop the singleton so the next getDemoStore() is fresh. */
export function __resetDemoStoreSingleton(): void {
  singleton = null
}
