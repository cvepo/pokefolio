"use client"

/**
 * The Compare page body.
 *
 * Extracted so the authenticated page and the public demo render the identical
 * view — same chart, same selector, same table, same maths. Only the source of
 * `data` differs: the real page fetches /api/compare/series, the demo reads the
 * frozen price history out of its sandbox store.
 *
 * This split is what lets the demo show a real comparison chart. It previously
 * showed a table only, because the demo had no route to price history at all.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Package, ChevronDown } from "lucide-react"
import type { CompareSeriesResponse } from "@/lib/compare-series"
import { ProductSelector } from "@/components/compare/product-selector"
import { ComparisonChart } from "@/components/compare/comparison-chart"
import { ComparisonTable } from "@/components/compare/comparison-table"
import { FreshnessBanner } from "@/components/compare/freshness-banner"
import {
  assignSeriesColors,
  buildComparePriceIndex,
  buildComparisonSeries,
  computeRowMetrics,
  topMoverIds,
  windowStartFor,
  type CompareProduct,
  type CompareView,
} from "@/lib/compare-series"

type Timeframe = "7D" | "1M" | "3M" | "6M" | "MAX"

const VIEWS: Array<{ id: CompareView; label: string }> = [
  { id: "per_unit_pct", label: "Per-unit %" },
  { id: "position_abs", label: "Position $" },
  { id: "combined_pct", label: "Combined %" },
]

const VIEW_EXPLAINER: Record<CompareView, string> = {
  per_unit_pct:
    "Price change per single unit, rebased to 0 at the start of the window.",
  position_abs:
    "Dollar change across all units you hold today, applied to the full window.",
  combined_pct:
    "Your selected products as one basket, weighted by position size, from the first date all of them have prices.",
}
export function CompareView({
  data,
  settingsHref = "/settings",
}: {
  data: CompareSeriesResponse
  /** The demo points this at its own settings page. */
  settingsHref?: string
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1M")
  const [view, setView] = useState<CompareView>("per_unit_pct")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [initializedSelection, setInitializedSelection] = useState(false)
  const [search, setSearch] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [colorMap, setColorMap] = useState<Record<string, string>>({})
  const [selectorOpen, setSelectorOpen] = useState(false)


  const products: CompareProduct[] = useMemo(
    () => (data?.products ?? []) as CompareProduct[],
    [data]
  )

  const priceIndex = useMemo(() => buildComparePriceIndex(products), [products])

  const asOfDate = data?.meta.as_of_date ?? ""
  const earliestDate = data?.meta.earliest_date ?? asOfDate
  const windowStart = useMemo(
    () => (asOfDate ? windowStartFor(asOfDate, timeframe, earliestDate) : ""),
    [asOfDate, timeframe, earliestDate]
  )
  const windowEnd = asOfDate

  // Metrics for ALL held products (for selector Δ% + default Top movers).
  const allMetrics = useMemo(() => {
    if (!products.length || !windowStart || !windowEnd) return []
    return computeRowMetrics({
      products,
      selectedIds: products.map((p) => p.product_id),
      windowStart,
      windowEnd,
      totalStartingPortfolioValue: data?.meta.total_starting_value ?? 0,
      priceIndex,
    })
  }, [products, windowStart, windowEnd, data?.meta.total_starting_value, priceIndex])

  // Default selection: Top movers once data is ready.
  useEffect(() => {
    if (initializedSelection || !allMetrics.length) return
    const ids = topMoverIds(allMetrics, 5)
    setSelectedIds(new Set(ids.length ? ids : allMetrics.slice(0, 5).map((r) => r.product_id)))
    setInitializedSelection(true)
  }, [allMetrics, initializedSelection])

  // Preserve/resolve colors when selection changes.
  useEffect(() => {
    const ids = [...selectedIds]
    setColorMap((prior) => assignSeriesColors(ids, prior))
  }, [selectedIds])

  const selectedMetrics = useMemo(
    () => allMetrics.filter((r) => selectedIds.has(r.product_id)),
    [allMetrics, selectedIds]
  )

  const series = useMemo(() => {
    if (!products.length || !windowStart || !windowEnd || selectedIds.size === 0) {
      return {
        rows: [] as Array<Record<string, number | string | null>>,
        anchors: {},
        basketAnchorDate: null as string | null,
        filledRanges: {},
        excludedIds: [] as string[],
      }
    }
    return buildComparisonSeries({
      products,
      selectedIds: [...selectedIds],
      windowStart,
      windowEnd,
      view,
      priceIndex,
    })
  }, [products, selectedIds, windowStart, windowEnd, view, priceIndex])

  const selectorRows = useMemo(() => {
    return [...allMetrics]
      .sort((a, b) => (b.windowPct ?? -Infinity) - (a.windowPct ?? -Infinity))
      .map((r) => ({
        product_id: r.product_id,
        name: r.name,
        set_name: r.set_name,
        tcgplayer_id: r.tcgplayer_id,
        windowPct: r.windowPct,
        staleDays: r.staleDays,
        color: colorMap[r.product_id],
      }))
  }, [allMetrics, colorMap])

  const chartProducts = useMemo(() => {
    const excluded = new Set(series.excludedIds)
    return selectedMetrics
      .filter((r) => !excluded.has(r.product_id) && !r.chartExcluded)
      .map((r) => ({
        product_id: r.product_id,
        name: r.name,
        color: colorMap[r.product_id] ?? "#06b6d4",
        staleDays: r.staleDays,
        qty: r.qty,
      }))
  }, [selectedMetrics, series.excludedIds, colorMap])

  const staleProducts = useMemo(() => {
    return allMetrics
      .filter((r) => r.staleDays != null && r.staleDays > 0)
      .map((r) => ({ name: r.name, staleDays: r.staleDays! }))
      .sort((a, b) => b.staleDays - a.staleDays)
  }, [allMetrics])

  const hiddenNote = useMemo(() => {
    const dropped = new Set([
      ...allMetrics.filter((r) => r.noPriceHistory).map((r) => r.product_id),
      ...series.excludedIds,
    ]).size
    if (dropped === 0) return null
    return `${dropped} product${dropped === 1 ? "" : "s"} hidden — no valid price history`
  }, [allMetrics, series.excludedIds])

  const distinctDatesInWindow = useMemo(() => {
    if (!windowStart || !windowEnd) return 0
    const dates = new Set<string>()
    for (const p of products) {
      for (const [d] of p.history) {
        if (d >= windowStart && d <= windowEnd) dates.add(d)
      }
    }
    return dates.size
  }, [products, windowStart, windowEnd])

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(products.map((p) => p.product_id)))
  const selectNone = () => setSelectedIds(new Set())
  const selectTopMovers = () => setSelectedIds(new Set(topMoverIds(allMetrics, 5)))

  const isolationDisabled = view === "combined_pct"


  if (!products.length) {
    return (
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-4">
        <Header asOfDate="" productsCurrent={0} productsTotal={0} staleProducts={[]} />
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-xl text-center">
          <Package size={44} className="text-muted-foreground mb-4" />
          <p className="font-semibold text-lg">No holdings to compare</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add products via{" "}
            <Link href="/search" className="underline underline-offset-2">
              Search
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const notEnoughHistory = distinctDatesInWindow < 2

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-4 overflow-x-hidden">
      <Header
        asOfDate={asOfDate}
        productsCurrent={data?.meta.products_current ?? 0}
        productsTotal={data?.meta.products_total ?? 0}
        staleProducts={staleProducts}
      />

      {hiddenNote && (
        <p className="text-xs text-muted-foreground">{hiddenNote}</p>
      )}

      {/* Mobile selector accordion */}
      <div className="lg:hidden border border-border rounded-xl bg-card">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
          onClick={() => setSelectorOpen((o) => !o)}
        >
          Products ({selectedIds.size} selected)
          <ChevronDown
            size={16}
            className={`transition-transform ${selectorOpen ? "rotate-180" : ""}`}
          />
        </button>
        {selectorOpen && (
          <div className="border-t border-border max-h-72 overflow-hidden">
            <ProductSelector
              rows={selectorRows}
              selectedIds={selectedIds}
              search={search}
              onSearchChange={setSearch}
              onToggle={toggleId}
              onSelectAll={selectAll}
              onSelectNone={selectNone}
              onSelectTopMovers={selectTopMovers}
              onHover={setHoveredId}
              hoveredId={hoveredId}
              isolationDisabled={isolationDisabled}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-stretch">
        <aside className="hidden lg:block border border-border rounded-xl bg-card overflow-hidden max-h-[620px]">
          <ProductSelector
            rows={selectorRows}
            selectedIds={selectedIds}
            search={search}
            onSearchChange={setSearch}
            onToggle={toggleId}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            onSelectTopMovers={selectTopMovers}
            onHover={setHoveredId}
            hoveredId={hoveredId}
            isolationDisabled={isolationDisabled}
          />
        </aside>

        <section className="border border-border rounded-xl bg-card p-4 md:p-5 space-y-3 min-w-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              {(["7D", "1M", "3M", "6M", "MAX"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeframe === tf
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 p-0.5 rounded-md border border-border bg-background/50 w-fit">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    view === v.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{VIEW_EXPLAINER[view]}</p>
          </div>

          {notEnoughHistory ? (
            <div className="h-[480px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2 text-center px-4">
              <p>Not enough price history in this range — try a longer timeframe</p>
              <Link href={settingsHref} className="underline underline-offset-2 text-xs">
                Run a sync in Settings
              </Link>
            </div>
          ) : (
            <ComparisonChart
              rows={series.rows}
              products={chartProducts}
              view={view}
              colors={colorMap}
              hoveredId={isolationDisabled ? null : hoveredId}
              anchors={series.anchors}
              basketAnchorDate={series.basketAnchorDate}
              windowStart={windowStart}
              emptyMessage={
                selectedIds.size === 0 ? "Select products to compare" : undefined
              }
            />
          )}
        </section>
      </div>

      {selectedIds.size > 0 && !notEnoughHistory && (
        <ComparisonTable
          rows={selectedMetrics}
          colors={colorMap}
          hoveredId={isolationDisabled ? null : hoveredId}
          onHover={setHoveredId}
          isolationDisabled={isolationDisabled}
          onRowClick={isolationDisabled ? toggleId : undefined}
        />
      )}
    </div>
  )
}

function Header({
  asOfDate,
  productsCurrent,
  productsTotal,
  staleProducts,
}: {
  asOfDate: string
  productsCurrent: number
  productsTotal: number
  staleProducts: Array<{ name: string; staleDays: number }>
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">Compare</h1>
      <p className="text-sm text-muted-foreground mt-0.5">
        Normalized performance across your holdings
      </p>
      <FreshnessBanner
        asOfDate={asOfDate}
        productsCurrent={productsCurrent}
        productsTotal={productsTotal}
        staleProducts={staleProducts}
      />
    </div>
  )
}
