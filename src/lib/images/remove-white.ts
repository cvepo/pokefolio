/**
 * Turn the white studio background of a product photo transparent.
 *
 * Pure pixel maths over an RGBA buffer, deliberately free of any image codec so
 * it can be unit-tested without decoding a real JPEG.
 *
 * ## Why a flood fill rather than a threshold
 *
 * The obvious approach — "make every near-white pixel transparent" — punches
 * holes through the product itself. Sealed Pokémon product boxes are full of
 * white: logos, borders, card art, text. A global threshold erases those too and
 * leaves a moth-eaten cutout.
 *
 * Instead this floods inward from the image border and only clears near-white
 * pixels *connected to the edge*. White inside the product is enclosed by
 * non-white pixels, so the flood never reaches it and it survives intact.
 */

export type RemoveWhiteOptions = {
  /**
   * Minimum channel value for a pixel to count as background. JPEG compression
   * leaves studio white around 245-255, while product highlights are usually
   * below this once shading is taken into account.
   */
  threshold?: number
  /**
   * Pixels within this distance *below* the threshold get partial alpha rather
   * than staying fully opaque, which softens the cutout edge instead of leaving
   * an aliased white fringe.
   */
  feather?: number
}

const DEFAULT_THRESHOLD = 236
const DEFAULT_FEATHER = 26

/** Is this pixel light enough to be studio background? */
function isBackground(
  data: Uint8ClampedArray | Uint8Array,
  offset: number,
  threshold: number
): boolean {
  return data[offset] >= threshold && data[offset + 1] >= threshold && data[offset + 2] >= threshold
}

/**
 * Clear the edge-connected background of an RGBA image in place.
 *
 * Returns the number of pixels made fully transparent, which is useful as a
 * sanity check: a result of 0 means nothing was removed (an image that was
 * already cropped tight, or not on white), and a result approaching the whole
 * image means the threshold was too aggressive.
 */
export function removeWhiteBackground(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: RemoveWhiteOptions = {}
): number {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const feather = options.feather ?? DEFAULT_FEATHER
  if (width <= 0 || height <= 0) return 0

  const total = width * height
  const visited = new Uint8Array(total)
  // Explicit stack — a recursive flood fill overflows on a 1000px image.
  const stack: number[] = []

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (visited[index]) return
    if (!isBackground(data, index * 4, threshold)) return
    visited[index] = 1
    stack.push(index)
  }

  // Seed from every border pixel: the background is whatever touches the frame.
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }

  let cleared = 0
  while (stack.length > 0) {
    const index = stack.pop() as number
    data[index * 4 + 3] = 0
    cleared += 1

    const x = index % width
    const y = (index - x) / width
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  if (feather > 0) {
    softenEdges(data, width, height, visited, threshold, feather)
  }

  return cleared
}

/**
 * Fade pixels that sit just below the background threshold and neighbour a
 * cleared pixel. Without this the cutout keeps a hard ring of almost-white,
 * which reads as a halo against a dark surface.
 */
function softenEdges(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  visited: Uint8Array,
  threshold: number,
  feather: number
): void {
  const floor = Math.max(0, threshold - feather)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (visited[index]) continue

      const offset = index * 4
      const luminance = Math.min(data[offset], data[offset + 1], data[offset + 2])
      if (luminance < floor) continue

      // Only feather pixels actually adjacent to removed background, so light
      // areas in the middle of the product are left alone.
      const touchesCleared =
        (x > 0 && visited[index - 1] === 1) ||
        (x < width - 1 && visited[index + 1] === 1) ||
        (y > 0 && visited[index - width] === 1) ||
        (y < height - 1 && visited[index + width] === 1)
      if (!touchesCleared) continue

      const ratio = (luminance - floor) / (threshold - floor)
      const alpha = Math.round(255 * (1 - Math.min(1, Math.max(0, ratio))))
      if (alpha < data[offset + 3]) data[offset + 3] = alpha
    }
  }
}
