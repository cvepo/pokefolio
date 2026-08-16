import sharp from "sharp"
import { supabase } from "@/lib/supabase-server"
import { removeWhiteBackground } from "./remove-white"

/**
 * Product thumbnails with the studio background removed, processed once and
 * cached in Supabase Storage.
 *
 * TCGplayer serves JPEGs on solid white. Those look like pasted rectangles on a
 * dark surface, and JPEG has no alpha channel so there is nothing to strip at
 * render time — the background has to be removed and re-encoded as PNG.
 *
 * Doing that per request would mean a fetch, a decode and a flood fill on every
 * page load, so each (product, size) is processed once and served from storage
 * thereafter. `sharp` ships with Next.js already, so this adds no dependency.
 */

const BUCKET = "product-images"

/** Fixed rendition sizes, so the cache cannot grow unbounded from arbitrary widths. */
export const PRODUCT_IMAGE_SIZES = [64, 128, 256] as const
export type ProductImageSize = (typeof PRODUCT_IMAGE_SIZES)[number]

/** Snap an arbitrary requested size up to the nearest cached rendition. */
export function normalizeSize(requested: number): ProductImageSize {
  for (const size of PRODUCT_IMAGE_SIZES) {
    if (requested <= size) return size
  }
  return PRODUCT_IMAGE_SIZES[PRODUCT_IMAGE_SIZES.length - 1]
}

export function storageKey(tcgplayerId: string, size: ProductImageSize): string {
  return `${tcgplayerId}-${size}.png`
}

function sourceUrl(tcgplayerId: string, size: ProductImageSize): string {
  // Ask for more pixels than we need so the flood fill has clean edges to work
  // with before downscaling.
  const source = size * 2
  return `https://product-images.tcgplayer.com/fit-in/${source}x${source}/${tcgplayerId}.jpg`
}

let bucketReady = false

/**
 * Create the storage bucket on first use.
 *
 * Public because these are already-public product photos, and a public object
 * URL avoids signing every thumbnail on every dashboard render.
 */
async function ensureBucket(): Promise<void> {
  if (bucketReady) return
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (!data) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 1024 * 1024,
      allowedMimeTypes: ["image/png"],
    })
  }
  bucketReady = true
}

/** Public CDN URL for a rendition. The bucket is public, so no signing needed. */
function publicUrl(key: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}

/**
 * Does this rendition already exist?
 *
 * Uses a metadata listing rather than a download — the caller only needs to
 * know whether to generate, and pulling ~120KB of PNG bytes through the app
 * server just to discard them is pure waste.
 */
async function objectExists(key: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKET).list("", { search: key, limit: 1 })
  if (error || !data) return false
  return data.some((file) => file.name === key)
}

/**
 * Fetch, cut out the background, and downscale to a square PNG.
 *
 * Returns null when the source image does not exist — plenty of products have
 * no TCGplayer photo, and that must surface as "no image" rather than an error.
 */
async function processImage(
  tcgplayerId: string,
  size: ProductImageSize
): Promise<Buffer | null> {
  const response = await fetch(sourceUrl(tcgplayerId, size))
  if (!response.ok) return null

  const input = Buffer.from(await response.arrayBuffer())

  // Work at source resolution so the flood fill sees the original edges, then
  // downscale — resizing first would blend background into the product outline
  // and leave a grey fringe once the white is removed.
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  removeWhiteBackground(data, info.width, info.height)

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

export type ProductImageResult = {
  /** Public storage URL the client should be redirected to. */
  url: string
  /** True when this request had to generate the rendition rather than reuse it. */
  generated: boolean
}

/**
 * Ensure a background-removed thumbnail exists and return its public URL. Null
 * when the product has no source image.
 *
 * Returns a URL rather than bytes so the route can redirect: serving the PNG
 * through the app server would proxy every thumbnail on every dashboard load,
 * where a redirect lets the storage CDN serve it and be cached by the browser.
 */
export async function getProductImage(
  tcgplayerId: string,
  requestedSize: number
): Promise<ProductImageResult | null> {
  const size = normalizeSize(requestedSize)
  const key = storageKey(tcgplayerId, size)

  await ensureBucket()

  if (await objectExists(key)) {
    return { url: publicUrl(key), generated: false }
  }

  const processed = await processImage(tcgplayerId, size)
  if (!processed) return null

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, processed, { contentType: "image/png", upsert: true })
  if (error) {
    // Nothing to redirect to if the upload failed, so let the caller 502 rather
    // than hand back a URL that will 404.
    console.warn("[product-image] could not cache", key, error.message)
    return null
  }

  return { url: publicUrl(key), generated: true }
}
