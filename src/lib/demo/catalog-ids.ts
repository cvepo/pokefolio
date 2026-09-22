import { demoDataset } from "@/lib/demo/dataset"

/**
 * TCGplayer ids the public demo is allowed to request images for.
 *
 * `/api/product-image` does real work on a miss — fetch, decode, flood-fill,
 * re-encode, upload — so leaving it open to arbitrary ids would let anyone burn
 * CPU and storage by enumerating numbers. The demo only ever needs the ids in
 * its own frozen catalog, and that set is fixed at build time, so the public
 * surface is bounded to exactly those.
 */
export const DEMO_TCGPLAYER_IDS: ReadonlySet<string> = new Set(
  demoDataset.catalog
    .map((product) => product.tcgplayer_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
)
