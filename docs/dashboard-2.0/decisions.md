# Dashboard 2.0 — decision log & PRD amendments

Amendments to `prd.md`, resolved before implementation started. Where this file
and the PRD disagree, **this file wins** — the PRD is frozen as the original
brief rather than edited in place, so the reasoning stays auditable.

---

## A1 — Cost basis and realized P/L stay FIFO, not average-cost

**PRD says (§6):** cost basis is `avg_unit_cost × quantity_currently_held`,
realized P/L is `(sale_price − avg_unit_cost_at_time_of_sale) × qty_sold`, and
this "matches what the app already computes."

**The app does not do that.** `src/lib/holdings.ts` (`computeHoldings`)
implements true FIFO: buys push dated lots, sells consume the oldest open lots
first, and `realizedPnL` accumulates `(sellPrice − lot.buyPrice) × take` per
lot consumed. `costBasisRemaining` sums `remaining × buyPrice` over surviving
lots. `avgCostRemaining` is a *derived display figure* — `costBasisRemaining /
netQty` — not the method. The PRD read that one column and inferred the wrong
model.

This matters because §6 and §21 cannot both be satisfied: §21 requires the new
dashboard match the existing Data and Compare pages exactly, and those pages
are FIFO through `computeHoldings`.

**Decision: keep FIFO.** §6's average-cost language is struck. The Analytics
Engine reuses `computeHoldings` rather than reimplementing anything.

Consequences:

- `costBasis` in the API is FIFO open-lot cost basis.
- `realizedPnl` is FIFO realized P/L.
- `avgUnitCost` remains available as a derived per-unit display figure.
- Nothing about §6's *other* definitions changes — net cash flow, the
  Value-Change-not-Return distinction, and lot-level holding periods (§14) all
  stand as written. §14's lot-level metrics are in fact easier under FIFO,
  since real dated lots already exist rather than being blended away.
- No migration, no recalculation of historical figures, and the existing
  holdings tests stay valid.

---

## A2 — Money crosses the API as integer cents; storage stays `decimal(10,2)`

PRD §8 requires integer minor units in API responses. The database columns are
`decimal(10,2)` and are **not** being migrated — that would touch every
existing table and query for no gain at this scale.

Conversion happens at the API boundary, using `toCents` / `toCentsOrNull` from
`src/lib/dashboard/contract.ts`. Internal calculation modules
(`computeHoldings`, `compare-series`) keep operating in dollar floats as they
do today. Nothing inside the app changes units; only the response layer does.

---

## A3 — Signals reuse the existing Compare implementation

PRD §18 describes signal transitions but does not define the signals
themselves. They already exist: `classifyExitReviewSignal` and
`computeMomentum7d` in `src/lib/compare-series.ts`, with five states
(`Accelerating`, `Cooling`, `Recovering`, `Declining`, `Insufficient data`) and
test coverage.

The Analytics Engine imports those functions. It does not reimplement or
retune them — §21 forbids a silent recalculation, and a second copy of the
classifier would drift from Compare.

`Insufficient data` is a real state, not an error, and needs explicit handling
in the transition rules — see A4.

---

## A4 — Transitions in and out of `Insufficient data` create no event

PRD §18 fixes first-run behaviour (no event on the first-ever computed signal)
but is silent on `Insufficient data`, which the five-state classifier can enter
and leave whenever price coverage changes.

**Decision:** a transition where either side is `Insufficient data` produces no
event. `Insufficient data → Declining` means "we can finally see it," not "it
started declining," and firing an alert on data arrival would be noise. The
`from`/`to` pair is still persisted on the position's signal state so the next
real transition is computed correctly.

---

## A5 — Value Change is portfolio-level; position `valueChangePct` is per-unit

PRD §6 defines Value Change at the portfolio level, and §15 colours heatmap
cells by "1M Value Change" per position — but a position's value change
conflates price movement with quantity changes from buys and sells, which would
paint a cell green purely because more of it was bought.

**Decision:** `Position.valueChangePct` is **per-unit price change** over the
window. Portfolio-level `valueChangePct` on `/performance` remains true value
change including cash flows, as §6 requires. Both are honestly named for what
they measure; the heatmap and the outsized-move rule both use the per-unit
figure, which is the one that reflects the market rather than your deposits.

---

## A6 — Rollout via a parallel route

New dashboard is built at `/dashboard-v2`. The existing `/dashboard` is left
untouched until parity against the Data and Compare pages (§21, §23) has been
verified side by side, then the routes are swapped and the old page deleted.

---

## A7 — Migrations are files, applied manually

Existing repo convention (`supabase/migrations/00*.sql`, all headed "Run once
in the Supabase SQL editor"). New migrations follow it: numbered, idempotent
where possible, `IF NOT EXISTS` throughout, and RLS enabled to match
`004_enable_rls.sql`. No agent applies a migration to the live database.

---

## A8 — Workstream split

| Branch | Owner | Surface |
|---|---|---|
| `feat/dashboard-2-backend` | codex | `supabase/migrations/`, `src/lib/dashboard/` (except `contract.ts`), `src/lib/analytics/`, `src/app/api/` |
| `feat/dashboard-2-frontend` | cursor | `src/app/(app)/dashboard-v2/`, `src/components/dashboard/` |

`src/lib/dashboard/contract.ts` is owned by the integrator and is read-only to
both. It is the sole coordination point between the two branches — the frontend
builds against fixtures typed by it while the backend builds the endpoints that
satisfy it.
