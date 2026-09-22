# Demo UI notes (for integration)

Written by the demo-UI workstream. Do not treat as product docs — these are
handoff notes for the integrator merging UI + data layers.

## Temporary files to delete at merge

- `src/lib/demo/store-stub.ts` — satisfies `DemoStore` with hardcoded rows.
- In `src/lib/demo/get-store.ts`, replace the stub fallback with:

  ```ts
  import { createDemoStore } from "./store"
  singleton = createDemoStore()
  ```

  Do **not** keep both stores live in production.

## Contract gaps / closest-correct behaviour

### Compare has no price history on `DemoStore`

Live `/compare` needs `CompareSeriesResponse` (per-product history).
`DemoStore` exposes `getDashboard`, `searchProducts`, transactions, and
mutations — but not `getPriceHistory` / `getCompareSeries`.

**UI choice:** `/demo/compare` shows open positions and their
`valueChangePct` from `getDashboard`, labelled **Value Change**. It does
not invent series. Prefer adding a store method at integration if the full
chart/table should ship.

### Data stats are summary-derived

Live `/data` has richer fields (win rate, profitable sell count). Demo
`/demo/data` uses `getDashboard(...).summary` plus sell transaction counts.
Fine for a walkthrough; not a 1:1 field map.

### Insights / mark-seen

Stub `getDashboard` returns an empty insights list. `WhatChanged` accepts
`onMarkSeen` so demo never POSTs `/api/insights/seen`. Real store insights
will light up the panel without further UI work.

### Heatmap images

Live tiles use `/api/product-image/...` (auth-gated). Demo passes
`demoHeatmapImageUrl` (TCGPlayer CDN) so the public surface makes zero
`/api/*` requests.

### Sync display

Demo sync payload is intentionally empty / `state: "stale"` with null
timestamps — Settings and the sidebar say sync is off. Do not animate a
fake sync when wiring the real store unless the store reports a real run.

## Auth gate

`isDemoPath` matches exact `/demo` or `/demo/...` only. `/api/*` remains
gated. Demo pages must keep reading from `DemoStore` only.

## Shared component props (live behaviour unchanged)

| Component | Optional prop | Default |
|-----------|---------------|---------|
| `PortfolioSwitcher` | `portfolios` | fetch `/api/portfolios` |
| `WhatChanged` | `onMarkSeen` | POST `/api/insights/seen` |
| `HoldingsHeatmap` | `imageUrlFor` | `heatmapImageUrl` → `/api/product-image` |
