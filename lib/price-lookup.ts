/**
 * Build a sorted price index from raw price_snapshots rows so we can
 * look up the most-recent price ≤ a given date in O(log n).
 */
export type PriceIndex = Record<string, { date: string; price: number }[]>

export function buildPriceIndex(
  rows: Array<{ product_id: string; price: number | string; snapshot_date: string }>
): PriceIndex {
  const idx: PriceIndex = {}
  for (const r of rows) {
    const arr = idx[r.product_id] ?? (idx[r.product_id] = [])
    arr.push({ date: r.snapshot_date, price: Number(r.price) })
  }
  for (const arr of Object.values(idx)) {
    arr.sort((a, b) => a.date.localeCompare(b.date))
  }
  return idx
}

/**
 * Returns the price of `productId` on or before `date`, or null if no
 * snapshot exists at or before that date.
 */
export function priceOnOrBefore(idx: PriceIndex, productId: string, date: string): number | null {
  const arr = idx[productId]
  if (!arr?.length) return null
  let lo = 0,
    hi = arr.length - 1,
    found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid].date <= date) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found >= 0 ? arr[found].price : null
}

/** Build a contiguous list of YYYY-MM-DD strings from `start` to `end` (inclusive). */
export function daterange(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(start + "T00:00:00Z")
  const stop = new Date(end + "T00:00:00Z")
  while (cursor <= stop) {
    dates.push(cursor.toISOString().split("T")[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}
