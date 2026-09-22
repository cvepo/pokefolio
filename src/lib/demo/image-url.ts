/** Public CDN thumbs for demo mode — never hit authenticated `/api/product-image`. */
export function demoHeatmapImageUrl(tcgplayerId: string | null, size: number): string | null {
  if (!tcgplayerId || size <= 0) return null
  const px = Math.min(256, Math.max(64, size * 2))
  return `https://product-images.tcgplayer.com/fit-in/${px}x${px}/${tcgplayerId}.jpg`
}
