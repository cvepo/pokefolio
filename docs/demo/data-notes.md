# Demo data notes

## Safety boundary

- The committed dataset contains catalog rows, public price history, and synthetic transactions only. The generator never queries the `transactions` or `portfolios` tables.
- Runtime demo modules do not import `@/lib/supabase-server`, `fs`, or other Node-only modules. A boundary test scans the demo directory so this cannot regress silently.
- The single synthetic portfolio uses the fixed UUID `00000000-0000-4000-8000-000000000001` and the name **Demo Collection**.

## Portfolio generation

- `scripts/generate-demo-dataset.mjs` reads the full products catalog and paginates the full `price_snapshots` table. In a network-restricted environment it accepts `--input` with a JSON object containing `products` and `priceSnapshots` arrays.
- Selection is deterministic. It searches only products with history for 12–15 open positions and checks value, FIFO open-lot basis, unrealized return, set diversity, buy-date diversity, winner/loser mix, one-month spread, and an open lot in the 335–364 day window.
- Every synthetic buy and sell price is copied from the selected product's historical snapshot on that transaction date. Three buys include one extra unit that is later sold, leaving a partial FIFO lot open and producing non-zero realized P/L.
- Generation fails instead of writing `dataset.ts` when the live price history cannot satisfy the agreed target ranges. This is intentional: catalog drift should trigger a conscious retune rather than quietly weakening the demo.

## Runtime behavior

- The store builds one in-memory `PriceIndex` from the column-wise fixture and calls `computeAnalytics` for every dashboard read. The dataset's `asOf` date is used for valuation and holding age; wall-clock time is never used for analytics.
- Visitor mutations persist in `sessionStorage`. If storage is missing, blocked, malformed, or full, the same store continues in memory for the lifetime of the page.
- Seeded What Changed events compare positions at the frozen date with their state seven frozen days earlier, then run the production transition rules. Visitor edits are recomputed against that same seeded baseline.
- `DemoDataset` has no persisted insight-state or event-history field. Consequently the demo can show transitions derivable from its frozen prices and current visitor state, but it cannot reproduce production-only seen timestamps or a long-lived history of earlier resolved concentration/drawdown events. The store leaves those out rather than fabricating them.
