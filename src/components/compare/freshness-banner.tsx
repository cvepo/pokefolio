"use client"

import { formatSnapshotDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

type FreshnessBannerProps = {
  asOfDate: string
  productsCurrent: number
  productsTotal: number
  /** Products sorted stalest-first for the warning tooltip. */
  staleProducts: Array<{ name: string; staleDays: number }>
}

export function FreshnessBanner({
  asOfDate,
  productsCurrent,
  productsTotal,
  staleProducts,
}: FreshnessBannerProps) {
  if (!asOfDate || productsTotal === 0) return null

  const coverage = productsCurrent / productsTotal
  const warn = coverage < 0.8
  const label = formatSnapshotDate(asOfDate)
  // Full date for the header (e.g. "Aug 6, 2026")
  const [y, m, d] = asOfDate.split("-").map(Number)
  const fullLabel = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const tip =
    warn && staleProducts.length
      ? staleProducts
          .slice(0, 8)
          .map((p) => `${p.name} (${p.staleDays}d)`)
          .join(", ") + (staleProducts.length > 8 ? ` +${staleProducts.length - 8} more` : "")
      : undefined

  return (
    <p
      className={cn(
        "text-sm mt-1 flex items-center gap-1.5 flex-wrap",
        warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
      )}
      title={tip}
    >
      {warn && (
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
      )}
      <span>
        Prices through {fullLabel || label} · {productsCurrent} of {productsTotal} products updated
        today
        {warn ? " ⚠" : ""}
      </span>
    </p>
  )
}

/** Staleness chip when last_snapshot_date trails as_of by more than 7 days. */
export function StalenessChip({ staleDays }: { staleDays: number | null | undefined }) {
  if (staleDays == null || staleDays <= 7) return null
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded"
      title={`Last price snapshot ${staleDays} days before as-of date`}
    >
      ⚠{staleDays}d
    </span>
  )
}
