import type { DemoStore } from "@/lib/demo/contract"
import { createDemoStore as createStoreCore } from "@/lib/demo/store-core"
import { demoDataset } from "@/lib/demo/dataset"

/**
 * The demo store, bound to the frozen dataset.
 *
 * `store-core` takes the dataset and its storage as parameters so it stays pure
 * and testable; this is the one place the real committed dataset and the
 * browser's sessionStorage get wired in. Kept separate so tests can drive the
 * core with their own fixtures and their own fake storage.
 */
export function createDemoStore(): DemoStore {
  return createStoreCore(demoDataset as Parameters<typeof createStoreCore>[0])
}
