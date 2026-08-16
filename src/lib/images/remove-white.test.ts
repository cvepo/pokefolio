import { describe, expect, it } from "vitest"
import { removeWhiteBackground } from "./remove-white"

/** Build an RGBA buffer from a grid of [r,g,b] triples. */
function buffer(grid: number[][][]): { data: Uint8ClampedArray; w: number; h: number } {
  const h = grid.length
  const w = grid[0].length
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const [r, g, b] = grid[y][x]
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  return { data, w, h }
}

const W = [255, 255, 255] // studio white
const K = [10, 10, 10] // product (dark)

function alphaAt(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  return data[(y * w + x) * 4 + 3]
}

describe("removeWhiteBackground", () => {
  it("clears white that touches the border", () => {
    const { data, w, h } = buffer([
      [W, W, W],
      [W, K, W],
      [W, W, W],
    ])
    const cleared = removeWhiteBackground(data, w, h, { feather: 0 })
    expect(cleared).toBe(8)
    expect(alphaAt(data, w, 0, 0)).toBe(0)
    expect(alphaAt(data, w, 1, 1)).toBe(255) // the product survives
  })

  it("preserves white ENCLOSED by the product — the whole point of a flood fill", () => {
    // A white pixel in the middle of a dark ring: a logo, border or card art.
    // A naive threshold would erase it and leave a hole.
    const { data, w, h } = buffer([
      [W, W, W, W, W],
      [W, K, K, K, W],
      [W, K, W, K, W],
      [W, K, K, K, W],
      [W, W, W, W, W],
    ])
    removeWhiteBackground(data, w, h, { feather: 0 })
    expect(alphaAt(data, w, 2, 2)).toBe(255)
    expect(alphaAt(data, w, 0, 0)).toBe(0)
  })

  it("reaches white that snakes in from the edge", () => {
    const { data, w, h } = buffer([
      [W, K, K, K, K],
      [W, W, W, W, K],
      [K, K, K, W, K],
      [K, K, K, W, K],
    ])
    removeWhiteBackground(data, w, h, { feather: 0 })
    expect(alphaAt(data, w, 3, 3)).toBe(0) // connected to the edge by a corridor
  })

  it("leaves an image with no white background untouched", () => {
    const { data, w, h } = buffer([
      [K, K],
      [K, K],
    ])
    expect(removeWhiteBackground(data, w, h, { feather: 0 })).toBe(0)
    expect(alphaAt(data, w, 0, 0)).toBe(255)
  })

  it("clears an entirely white image completely", () => {
    const { data, w, h } = buffer([
      [W, W],
      [W, W],
    ])
    expect(removeWhiteBackground(data, w, h, { feather: 0 })).toBe(4)
  })

  it("respects a custom threshold", () => {
    const grey = [200, 200, 200]
    const { data, w, h } = buffer([
      [grey, grey],
      [grey, grey],
    ])
    expect(removeWhiteBackground(data, w, h, { threshold: 236, feather: 0 })).toBe(0)
    expect(removeWhiteBackground(data, w, h, { threshold: 180, feather: 0 })).toBe(4)
  })

  it("feathers the almost-white rim instead of leaving a hard halo", () => {
    const rim = [242, 242, 242]
    const { data, w, h } = buffer([
      [W, W, W, W, W],
      [W, rim, rim, rim, W],
      [W, rim, K, rim, W],
      [W, rim, rim, rim, W],
      [W, W, W, W, W],
    ])
    removeWhiteBackground(data, w, h, { threshold: 250, feather: 20 })
    // The rim sits below the threshold so it is not flood-filled, but it
    // neighbours cleared pixels and so becomes partially transparent.
    const rimAlpha = alphaAt(data, w, 1, 1)
    expect(rimAlpha).toBeGreaterThan(0)
    expect(rimAlpha).toBeLessThan(255)
    expect(alphaAt(data, w, 2, 2)).toBe(255) // product still fully opaque
  })

  it("handles a degenerate size without throwing", () => {
    expect(removeWhiteBackground(new Uint8ClampedArray(0), 0, 0)).toBe(0)
  })

  it("does not overflow the stack on a large image", () => {
    const w = 600
    const h = 600
    const data = new Uint8ClampedArray(w * h * 4).fill(255)
    expect(() => removeWhiteBackground(data, w, h, { feather: 0 })).not.toThrow()
  })
})
