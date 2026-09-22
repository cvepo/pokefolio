/**
 * Demo product thumbnails.
 *
 * Uses the same cutout route the authenticated app uses, so demo tiles get the
 * background-removed PNG rather than TCGplayer's white-background JPEG sitting
 * on a dark tile. The proxy allows this route publicly only for ids in the
 * demo's own catalog — see `catalog-ids.ts`.
 */
export function demoHeatmapImageUrl(tcgplayerId: string | null, size: number): string | null {
  if (!tcgplayerId || size <= 0) return null
  const px = Math.min(256, Math.max(64, size * 2))
  return `/api/product-image/${tcgplayerId}?size=${px}`
}
