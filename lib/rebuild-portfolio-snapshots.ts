import { supabase } from "@/lib/supabase"

/**
 * Rebuilds portfolio_snapshots from existing price_snapshots data — no API
 * calls. Pass portfolioIds to scope the rebuild to specific portfolios only,
 * or omit to rebuild all.
 */
export async function rebuildPortfolioSnapshots(portfolioIds?: string[]): Promise<void> {
  const today = new Date().toISOString().split("T")[0]

  let itemsQuery = supabase
    .from("portfolio_items")
    .select("portfolio_id, product_id, quantity, purchase_date, purchase_price")
  if (portfolioIds?.length) {
    itemsQuery = itemsQuery.in("portfolio_id", portfolioIds)
  }

  const { data: allItems } = await itemsQuery
  if (!allItems?.length) return

  const productIds = [...new Set(allItems.map((i) => i.product_id))]

  const { data: allPriceSnaps } = await supabase
    .from("price_snapshots")
    .select("product_id, price, snapshot_date")
    .in("product_id", productIds)

  // Index prices: product_id → sorted [{ date, price }]
  const pricesByProduct: Record<string, { date: string; price: number }[]> = {}
  for (const snap of allPriceSnaps ?? []) {
    const arr = pricesByProduct[snap.product_id] ?? (pricesByProduct[snap.product_id] = [])
    arr.push({ date: snap.snapshot_date, price: Number(snap.price) })
  }
  for (const arr of Object.values(pricesByProduct)) {
    arr.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Earliest date to compute from
  let earliest: string | null = null
  for (const it of allItems) {
    if (it.purchase_date && (earliest === null || it.purchase_date < earliest)) {
      earliest = it.purchase_date
    }
  }
  if (earliest === null) {
    for (const arr of Object.values(pricesByProduct)) {
      if (arr.length && (earliest === null || arr[0].date < earliest)) {
        earliest = arr[0].date
      }
    }
  }
  if (!earliest) return

  const priceOnOrBefore = (productId: string, date: string): number | null => {
    const arr = pricesByProduct[productId]
    if (!arr?.length) return null
    let lo = 0, hi = arr.length - 1, found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (arr[mid].date <= date) { found = mid; lo = mid + 1 } else { hi = mid - 1 }
    }
    return found >= 0 ? arr[found].price : null
  }

  const dates: string[] = []
  const cursor = new Date(earliest + "T00:00:00Z")
  const end = new Date(today + "T00:00:00Z")
  while (cursor <= end) {
    dates.push(cursor.toISOString().split("T")[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const itemsByPortfolio: Record<string, typeof allItems> = {}
  for (const it of allItems) {
    ;(itemsByPortfolio[it.portfolio_id] ??= []).push(it)
  }

  const rows: Array<{ portfolio_id: string; total_value: number; snapshot_date: string }> = []

  for (const date of dates) {
    for (const [portfolio_id, pItems] of Object.entries(itemsByPortfolio)) {
      let total = 0
      let anyOwned = false
      for (const it of pItems) {
        if (it.purchase_date && it.purchase_date > date) continue
        anyOwned = true
        const market = priceOnOrBefore(it.product_id, date)
        total += (market ?? Number(it.purchase_price)) * it.quantity
      }
      if (anyOwned) rows.push({ portfolio_id, total_value: total, snapshot_date: date })
    }
  }

  if (!rows.length) return

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await supabase
      .from("portfolio_snapshots")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "portfolio_id,snapshot_date" })
  }
}
