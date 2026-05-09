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

/**
 * Page through price_snapshots in 1000-row chunks to bypass the Supabase
 * default row cap. Pure read; safe to call any number of times.
 */
type PriceSnapRow = { product_id: string; price: number | string; snapshot_date: string }
type SbClient = {
  from: (t: string) => {
    select: (cols: string) => {
      in: (col: string, vals: string[]) => {
        range: (a: number, b: number) => PromiseLike<{ data: PriceSnapRow[] | null }>
      }
    }
  }
}
export async function fetchAllPriceSnapshots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  productIds: string[]
): Promise<PriceSnapRow[]> {
  if (!productIds.length) return []
  const PAGE = 1000
  const all: PriceSnapRow[] = []
  const client = supabase as SbClient
  for (let from = 0; ; from += PAGE) {
    const { data } = await client
      .from("price_snapshots")
      .select("product_id, price, snapshot_date")
      .in("product_id", productIds)
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
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
