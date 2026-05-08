import type { Transaction } from "@/lib/supabase"

export type Lot = {
  buyTransactionId: string
  buyDate: string
  buyPrice: number
  remaining: number
}

export type Holdings = {
  /** Net quantity currently held: total bought − total sold. */
  netQty: number
  /** Cumulative qty across all 'buy' transactions. */
  totalBuyQty: number
  /** Cumulative qty across all 'sell' transactions. */
  totalSellQty: number
  /** Cumulative cash spent on buys. */
  totalInvested: number
  /** Cumulative cash received from sells. */
  totalProceeds: number
  /** Sum of (remaining_qty × buy_price) across unsold FIFO lots. */
  costBasisRemaining: number
  /** Average cost per remaining unit (costBasisRemaining / netQty). 0 if no holdings. */
  avgCostRemaining: number
  /** Realized profit from sells, computed via FIFO. */
  realizedPnL: number
  /** Number of sell transactions whose realized P&L was positive. */
  profitableSells: number
  /** Total number of sell transactions. */
  totalSells: number
  /** Remaining (unsold) FIFO lots, oldest first. */
  lots: Lot[]
  /** Earliest buy date among remaining lots, or null if no holdings. */
  earliestRemainingBuyDate: string | null
}

/**
 * Compute holdings from a list of transactions for ONE (portfolio, product) pair, using FIFO.
 * Ignores any over-sell quantity that cannot be matched to buys (caller is expected to
 * block over-selling at the API layer).
 */
export function computeHoldings(transactions: Transaction[]): Holdings {
  // Stable sort: by transaction_date asc, then created_at asc as tiebreaker.
  const sorted = [...transactions].sort((a, b) => {
    const d = a.transaction_date.localeCompare(b.transaction_date)
    if (d !== 0) return d
    return (a.created_at ?? "").localeCompare(b.created_at ?? "")
  })

  const lots: Lot[] = []
  let realizedPnL = 0
  let totalBuyQty = 0
  let totalSellQty = 0
  let totalInvested = 0
  let totalProceeds = 0
  let profitableSells = 0
  let totalSells = 0

  for (const tx of sorted) {
    if (tx.type === "buy") {
      lots.push({
        buyTransactionId: tx.id,
        buyDate: tx.transaction_date,
        buyPrice: Number(tx.price),
        remaining: tx.quantity,
      })
      totalBuyQty += tx.quantity
      totalInvested += Number(tx.price) * tx.quantity
    } else {
      // sell — FIFO consume from oldest non-empty lots
      let toSell = tx.quantity
      const sellPrice = Number(tx.price)
      let realizedThisSell = 0
      for (const lot of lots) {
        if (toSell === 0) break
        if (lot.remaining === 0) continue
        const take = Math.min(lot.remaining, toSell)
        realizedThisSell += (sellPrice - lot.buyPrice) * take
        lot.remaining -= take
        toSell -= take
      }
      realizedPnL += realizedThisSell
      totalSellQty += tx.quantity - toSell // only count what was actually matched
      totalProceeds += sellPrice * (tx.quantity - toSell)
      totalSells += 1
      if (realizedThisSell > 0) profitableSells += 1
    }
  }

  const remainingLots = lots.filter((l) => l.remaining > 0)
  const netQty = remainingLots.reduce((s, l) => s + l.remaining, 0)
  const costBasisRemaining = remainingLots.reduce((s, l) => s + l.remaining * l.buyPrice, 0)
  const avgCostRemaining = netQty > 0 ? costBasisRemaining / netQty : 0
  const earliestRemainingBuyDate = remainingLots.length ? remainingLots[0].buyDate : null

  return {
    netQty,
    totalBuyQty,
    totalSellQty,
    totalInvested,
    totalProceeds,
    costBasisRemaining,
    avgCostRemaining,
    realizedPnL,
    profitableSells,
    totalSells,
    lots: remainingLots,
    earliestRemainingBuyDate,
  }
}

/** Holdings as of a specific date (inclusive). Used for snapshot rebuild. */
export function computeHoldingsAsOf(transactions: Transaction[], date: string): Holdings {
  return computeHoldings(transactions.filter((t) => t.transaction_date <= date))
}

/**
 * Verify that adding a new sell of `qty` won't drop net holdings below 0
 * given the existing transactions. Returns null if ok, error string otherwise.
 */
export function checkOversell(existing: Transaction[], sellQty: number): string | null {
  const h = computeHoldings(existing)
  if (sellQty > h.netQty) {
    return `Cannot sell ${sellQty} — only ${h.netQty} held.`
  }
  return null
}
