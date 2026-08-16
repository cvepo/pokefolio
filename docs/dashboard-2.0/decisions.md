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

Both branches merged into `main` with no conflicts. Neither agent edited the
contract; the contract-as-types approach held, and the two halves compiled
together on the first attempt.

---

## A9 — Pre-tracking dates are valued at cost basis, and marked

Pokéfolio only has prices from the day it began tracking each product
(~2025-05-09), but the earliest transaction is 2025-01-25. Something has to be
shown for the 125 days in between.

The first implementation contributed **zero** for unpriced positions. Measured
against the live dataset that understated the chart by up to **$10,410**, while
today's figure matched exactly — a chart correct at the right edge and five
figures wrong at the left is worse than one that is visibly broken, because
nothing signals the error.

**Decision:** fall back to the position's cost basis, exactly as
`rebuildPortfolioSnapshots` already does, so `/dashboard-v2` agrees with
`/dashboard` and `/data` (§21). Verified empirically: **0 of 569 days differ.**

Because §8 forbids substituting a value without indicating it, the fallback is
reported rather than hidden. `PerformancePoint.actualBasis` is `market`,
`partial` or `cost`, the chart shades the affected span, and the tooltip states
it in words so shading is never the only signal.

---

## A10 — Analytics failures must not fail the operation that triggered them

A manual sync priced all 20 products, spent its API request, wrote every
snapshot — and then reported failure, because the analytics publish threw on a
table that did not exist yet and the error escaped the route.

Pricing is expensive, rate-limited against a 100/day budget, and not freely
retryable. Analytics is pure recomputation over already-committed data that the
next sync or mutation rebuilds for free. Letting the cheap half fail the
expensive one reports a data outage that did not happen.

**Decision:** analytics recomputation never throws into its caller. `/api/sync`
returns `analyticsPublished` / `analyticsError` so the staleness is visible, and
mutations go through `refreshAnalyticsAfterMutation`, which logs and continues —
a saved purchase must never surface as "adding your purchase failed".

---

## Integration status

Migrations 005-008 applied 2026-08-16. Two snapshots published (combined +
Main), 3 insight events created on the combined scope.

### Verified against the live database

**PRD §21 parity — PASSED.** Every headline figure on `/dashboard-v2` matches a
`/data`-style recomputation exactly:

| Figure | Snapshot | Recomputed | |
|---|---|---|---|
| totalValue | 40,098.90 | 40,098.90 | match |
| costBasis | 14,275.00 | 14,275.00 | match |
| unrealizedPnl | 25,823.90 | 25,823.90 | match |
| realizedPnl | 0.00 | 0.00 | match |
| netCashFlow | −14,275.00 | −14,275.00 | match |
| totalInvested | 14,275.00 | 14,275.00 | match |
| totalProceeds | 0.00 | 0.00 | match |
| unitCount | 248 | 248 | match |

The value chart was separately verified across all 569 days (A9): 0 differ.

**Failure isolation (A10) — CONFIRMED in production.** Manual syncs now log
`success 20/20` where the same run previously logged `failed`.

### Open question — the Holding period pane should probably become something else

Flagged 2026-08-16. The pane is built to spec (PRD §14: value-weighted age,
oldest open lot, lots aged 335-364 days) but earns very little of its space in
practice. Measured against the live portfolio:

| Observation | Value |
|---|---|
| Positions | 20 |
| Distinct buy dates across all of them | **4** (2025-01-25, 02-02, 02-09, 05-09) |
| Distinct "oldest open lot" ages | **4** |
| Age range of every open lot | 464-568 days |
| Lots approaching one year | **0** |
| Sell transactions, ever | **0** |

Why it falls flat:

1. **"Approaching one year" is structurally zero.** Everything held is already
   past a year, so the counter cannot become non-zero until something new is
   bought and then aged ~11 months. It is a permanently empty stat.
2. **Its stated purpose is already moot.** §14 justifies the 335-364 day window
   by long- vs short-term capital gains planning. Every lot is already
   long-term, so there is no decision left to inform.
3. **Nothing has ever been sold**, so tax-lot planning is hypothetical anyway.
4. **The two age figures barely differ and never move.** With only four purchase
   dates, value-weighted age and oldest-lot age are nearly the same number, and
   both advance by exactly one day per day. On a dashboard whose entire premise
   is "tell me what changed" (§10), a pane that is identical every morning is
   the weakest thing on screen.

None of this is a defect — the spec was followed. It is that §14 was written
before there was data to check it against, and the portfolio's actual shape
(few purchase dates, no sales, everything already long-term) makes the metric
uninformative.

**Not decided — deliberately left open.** Candidates for the slot, all of which
change day to day, in rough order of fit with §10's "what changed, then leave":

- **Per-holding target prices / sell alerts** — already named as a fast-follow
  in §3 and §22, and the most actionable thing missing.
- **Ranked unrealized P/L contributors** — which positions actually move the
  portfolio, rather than which are oldest.
- **Concentration standing view** — currently only visible as a transient
  insight event when a threshold is crossed; there is no way to see current
  concentration without waiting for it to fire.
- **True Investment Performance** (§6) — the deferred cash-flow-adjusted metric,
  once it has its own spec.

Holding period itself is worth keeping *somewhere* — it becomes genuinely useful
the first time a sale is contemplated — but as a detail on the position or
product page, not a permanent dashboard pane.

### Still open

1. **Realized P/L parity is untested, not proven.** Every figure above matches,
   but `realizedPnl` and `totalProceeds` are both 0.00 because the portfolio
   contains no sell transactions yet. The engine groups transactions per product
   *across* portfolios while the older code groups per (portfolio, product) —
   identical while nothing is sold and only one portfolio exists, but those are
   exactly the conditions that make the difference invisible. Re-run the parity
   check after the first sell, or after a second portfolio holds a shared
   product.

2. **The category fixture is not the real catalog.** `categorize.test.ts` pins
   inference against product names from repository history and the PRD rather
   than the live `products.name` list, so a new set's naming convention could
   still land in Uncategorized unnoticed (PRD §13 asks for the full catalog).

3. **`POST /api/insights/seen` has no response type in the contract.** It
   returns `{ ok: true, updated: number }`. Add it at the next contract revision.

4. **Routes not yet swapped.** A6's precondition (verified parity) is now met
   for the current data, so `/dashboard` can be replaced by `/dashboard-v2` and
   the old page deleted whenever you want — but see item 1 first if you expect
   to record a sale soon.
