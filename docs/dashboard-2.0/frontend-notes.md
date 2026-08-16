# Dashboard 2.0 — frontend notes

Calls made while building `/dashboard-v2` against `contract.ts` and fixtures.
The integrator should reconcile these with the backend branch on merge.

## Fixture fallback until API exists

`/api/dashboard` 404s in this worktree. The page uses `useDashboard` against the real
endpoint; on fetch failure it falls back to `DASHBOARD_FIXTURE` and shows a banner so
every section (including hostile edge cases) is reviewable side-by-side with `/dashboard`.
Remove the fallback once the BFF is live if preferred — the hook already surfaces the
error without it.

## Ambiguity calls

### Chart timeframe vs. timeframe row

PRD §10 shows the chart above the six-window row; §11 says all six windows render
simultaneously (not a single selector). The chart still needs *one* series window
(`performance.seriesTimeframe`). **Call:** the six cells are display-only Value Change
figures; clicking a cell refetches `/api/dashboard?timeframe=` so the chart series
matches that window. Default remains `1M`.

### What Changed "View all"

No `/insights` full-page route exists yet. **Call:** "View all" expands the in-panel
list past the display cap of 5 (still severity-sorted). It does not navigate away.

### Heatmap tile sizing

PRD §15: size by value. **Call:** CSS grid with `flex-grow` proportional to
`marketValue`, minimum tile width so tiny positions stay readable. Not a true
treemap — good enough at ≤~50 positions.

### Portfolio switcher source

Contract query takes `portfolioId`, but the BFF does not return the portfolio list.
**Call:** load names from existing `GET /api/portfolios` (same as Data page). Default
scope is all portfolios combined (`portfolioId` omitted).

### Empty activity in the hostile fixture

Main fixture ships `activity.items: []` so the empty state is visible. Non-empty
rendering is covered by unit tests with a small inline fixture.

### Sidebar

Added a "Dashboard v2" nav item pointing at `/dashboard-v2`. Old `/dashboard` entry
unchanged.
