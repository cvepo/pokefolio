# Pokéfolio Dashboard 2.0 — Product Requirements

**Author:** enzo (with Claude)
**Status:** v3 — build-ready draft. Incorporates a full external review; ambiguities called out in that review have been resolved below rather than left open, so this can function as an implementation contract, not just a design brief.
**Related artifact:** `pokefolio-dashboard-concept.html` (visual wireframe)

## 1. Problem

Pokéfolio already tracks sealed-product holdings, prices, and P/L accurately, but the Dashboard — the page you actually land on — only shows total value, a 1-month chart, and four winners/four losers. Everything else useful (signals, allocation, concentration, transaction history) exists in the app but lives behind extra clicks on Compare, Data, and Portfolios. The goal of Pokéfolio is to let you sideline your Pokémon investments and check in with minimal effort. Today that requires visiting 3–4 pages to get a full picture, which works against that goal.

## 2. Goals

- Surface everything that matters for a passive check-in on one screen.
- Make the dashboard tell you what changed and what's actionable, not just what the numbers are.
- Build this so the same computed data can power a future mobile app and a future notifications pipeline without re-deriving any logic.
- Remove implementation ambiguity now, so engineering decisions made while building don't quietly redefine the product.

## 3. Non-goals (for this iteration)

- Building the mobile app itself, or notification delivery (push/email). In scope: architecting the data layer so those are additive later.
- Per-holding target price / sell-alert fields. Fast-follow.
- Mobile *responsive web* layout — a separate CSS effort, arguably superseded by "build a mobile app" as the real answer for on-the-go checks.
- A true cash-flow-adjusted investment-return calculation (time-weighted or money-weighted return). See §6 — v1 ships **Value Change**, not **Return**, and that distinction is load-bearing enough to get its own future spec rather than being folded in here.

## 4. User

Just you, single-portfolio-owner use case. No multi-tenant, sharing, or permissions considerations.

## 5. Current state (for reference)

Dashboard today: hero total value + 1M delta, actual/projected toggle chart, 4 winners + 4 losers over a fixed 1-month window. Everything else (per-holding signals on Compare, aggregate P/L on Data, sync health on Settings) exists elsewhere in the app already, computed inline per page rather than as shared, reusable data.

## 6. Domain & metric definitions

This section didn't exist in v2 and was the biggest gap. Precise definitions here, not during implementation:

- **Portfolio:** a named collection of holdings (today: just "Main"). The dashboard's default scope is **all portfolios combined**, with a portfolio switcher to scope to one — same pattern the Data and Search pages already use.
- **Holding / position** (used interchangeably): one product/SKU aggregated across every purchase of it within the selected scope. If you buy the same booster bundle three times, that's one position, not three.
- **Lot:** one individual purchase transaction — a specific quantity, price, and date. A position is the sum of its open lots. Cost basis, P/L, and holding-period stats are calculated at the lot level and rolled up to the position for display (see §14).
- **Cost basis:** average-cost method, open inventory only. `avg_unit_cost × quantity_currently_held`. Matches what the app already computes (the existing "Avg cost" column is a single blended figure, not FIFO/LIFO). Does not include tax, shipping, or fees — there's no field for those today. Flagged as a future data-entry enhancement, not in scope here.
- **Realized P/L:** average-cost method applied on sale — `(sale_price − avg_unit_cost_at_time_of_sale) × qty_sold`. Remaining lots' average cost is unaffected by a partial sale under this method (unlike FIFO/LIFO, which would remove specific lots). This matches the single-avg-cost model the app already uses; changing to FIFO/LIFO later is a bigger migration and out of scope.
- **Net cash flow:** purchases minus sale proceeds — money in vs. money out of the *collection*, not a brokerage-style cash account. Pokéfolio doesn't model cash balances, only inventory transactions, so this is `-total_invested + total_proceeds`, nothing more.

### Critical distinction: Value Change vs. Investment Performance

If your portfolio is $10,000 and you buy another $5,000 of inventory, it becomes ~$15,000. That is **not** a +50% return — it's new capital, not gains. The current dashboard's "1M" delta almost certainly conflates the two today (it's a raw before/after value comparison), and the v2 PRD's timeframe chips (7D/1M/3M/6M/1Y/MAX) would have inherited the same ambiguity silently.

**Decision for v1:** ship **Value Change** — `(current value − value N days ago) / value N days ago` — over each window, including the effect of any buys/sells during that window. Label it as such everywhere it appears: UI copy says "Value Change," never "Return" or "Performance"; the API field is `valueChangePct`, never `returnPct`. This is a labeling and API-naming requirement, not a new calculation — it's what the app already does, just correctly named.

A true cash-flow-adjusted **Investment Performance** metric (time-weighted or money-weighted return) is valuable — it's the only way to answer "did my picks actually do well, independent of how much I've deposited" — but it requires its own methodology decision and a full cash-flow ledger. Explicitly deferred (§3), tracked as a fast-follow with its own spec, not bundled into this redesign.

## 7. Architecture — compute once, deliver to any surface

Split into layers so mobile and notifications are additive later, not a rewrite. Two changes from the original proposal, per review: the engine reacts to **any** state change, not just the scheduled price sync; and published output is a **snapshot**, not a live recompute, so every consumer sees one consistent version of "now."

**Portfolio Analytics & Insights Engine** (renamed from "Insights Engine" — it now owns performance/value-change math too, not just Cooling/Declining/Recovering signals and attention rules). Recomputes on:

```text
Price sync            → Analytics & Insights Engine
Inventory transaction  → Analytics & Insights Engine   (add / edit / delete a buy or sell)
```

A position's concentration or value change must not go stale for hours just because the next scheduled price sync hasn't run yet — logging a purchase is a state change and should be reflected immediately. At current scale (~50 positions) recomputing on every mutation is cheap; this is not a performance optimization question.

Precomputing at write-time (rather than computing fresh per read) is valuable less for performance and more because it gives you: consistent snapshots, historical state to diff against, transition detection, a substrate for notifications, and one shared source of truth across web/mobile instead of each surface recomputing and risking drift.

```
                ┌─ Price sync ────────┐
                │                     ↓
External data ──┤               Domain data
                │                     │
User actions ───┴─ Transactions ──────┘
                                      ↓
                    Portfolio Analytics & Insights Engine
                                      ↓
                       Published snapshot + insight events
                              ↓                ↓
                        Domain API      Notification worker
                           ↓
                  ┌────────┴────────┐
                 Web              Mobile
```

## 8. Data contract & API conventions

Because mobile reuse is a real constraint now, not a someday-maybe, the API needs to be **domain-oriented, not visualization-oriented**, and its conventions need to be fixed now.

### Endpoints (canonical, domain-shaped)

```text
/api/portfolio/summary       — value, cost basis, unrealized/realized P/L, net cash flow
/api/portfolio/performance   — value change by timeframe (§6)
/api/portfolio/positions     — one row per position: value, cost, valueChangePct, signal, category, set
/api/portfolio/allocation    — rollups by set and by category
/api/activity                — recent transactions
/api/insights                — active + recently-resolved insight events (§17–19)
/api/sync/status             — freshness state (§12)
```

`/api/heatmap` and `/api/dashboard/summary` as originally proposed were rejected: a heatmap is a *rendering* of `positions`, not its own domain concept, and a mobile client should be free to render the same `positions` data as cards or a ranked list instead. The web client transforms `positions → heatmap`; mobile transforms `positions → cards`. Neither needs its own backend endpoint.

An aggregate `/api/dashboard` endpoint **is** reasonable so the web dashboard isn't firing seven requests on load — but it's a consumer-specific convenience (a BFF endpoint), explicitly not the canonical domain model, and it's just a server-side fan-out over the endpoints above.

### Response envelope & conventions

Every response carries snapshot metadata so consumers know exactly which portfolio state they're looking at:

```json
{
  "asOf": "2026-08-16T04:20:00Z",
  "snapshotId": "snap_01hz...",
  "currency": "USD",
  "data": { }
}
```

Fixed conventions, decided now to prevent frontend/backend drift later:

| Concern | Convention | Why |
|---|---|---|
| Percentages | Decimal fraction (`0.0592`, not `5.92`) | Unambiguous units; formatting (×100, `%`, sign) is a presentation concern, not a data concern |
| Money | Integer minor units (cents) | Avoids floating-point rounding on financial values |
| Dates/times | UTC, ISO 8601 | No timezone ambiguity across web/mobile |
| Missing history | `null` | Never `0` — a null and a zero-percent change are different facts (see §15) |
| Missing/stale price | Explicit `priceStatus` enum (`ok` / `stale` / `unknown`) | Never silently substituted with 0 or the previous value with no indication |

## 9. Snapshot consistency & atomic publishing

Without this, the dashboard can load mid-sync and blend states — total value from new prices, allocation from old prices, chart from an older snapshot still. Every completed analytics run publishes a snapshot:

```text
snapshot_id
as_of
source_sync_run_id   (or source_transaction_id for a mutation-triggered run)
status                (pending / published / failed)
```

A snapshot only becomes readable by any API endpoint after the **entire** computation succeeds — no partial snapshots served. Every payload's `snapshotId`/`asOf` (§8) lets any consumer, including a future mobile client, confirm it's reading one consistent version of "now," which matters a lot more once there's more than one consumer.

## 10. Dashboard information hierarchy

The redesign should answer four questions, in this order, before anything else competes for attention:

1. How much is it worth?
2. How am I doing? (Value Change, §6 — labeled honestly)
3. What changed?
4. Do I need to investigate anything?

Everything else — allocation, heatmap, activity, holding period — is supporting detail, not headline. That means **What Changed** (§19) moves up, directly under the value chart, not down near the bottom of the page as originally laid out:

```text
$X  Portfolio Value                         Synced 8m ago
+$Y / +Z% · 1Y  (Value Change)

[ VALUE CHART — Actual / Projected ]

7D    1M    3M    1Y    MAX
...   ...   ...   ...   ...

WHAT CHANGED
⚠ Concentration: Sea & Sky Premium Collection — 20.6% of portfolio
↓ Declining: Blooming Waters Premium Collection — −14.65% (1M)
↗ Recovering: V Heroes Tin [Espeon V]

PORTFOLIO
Cost basis · Unrealized P/L · Realized P/L · Net cash flow

ALLOCATION                    ACTIVITY
HOLDINGS HEATMAP
HOLDING PERIOD
```

Density is fine — that's the point of using the screen space — but the reading order should prioritize interpretation over just laying everything out flat.

## 11. Proposed dashboard sections

| Section | What it shows | API source | New computation? | Priority |
|---|---|---|---|---|
| Value + freshness header | Total value, Value Change (labeled), sync status | `/api/portfolio/summary`, `/api/sync/status` | None — relocate, relabel | P0 |
| Timeframe row | 7D/1M/3M/6M/1Y/MAX Value Change shown simultaneously | `/api/portfolio/performance` | None — render all at once | P0 |
| Value chart | Actual + Projected overlaid (§16) | `/api/portfolio/performance` | None — rendering change only | P0 |
| **What Changed** | Ranked, categorized insight events | `/api/insights` | Yes — §17–19 | P2 |
| Portfolio strip | Cost basis, unrealized/realized P/L, net cash flow | `/api/portfolio/summary` | None — relocate | P0 |
| Allocation by set / category | % of portfolio, two groupings | `/api/portfolio/allocation` | Small — categorization, §13 | P1 |
| Holdings heatmap | Grid, size = value, color = 1M Value Change | `/api/portfolio/positions` | UI only, edge cases in §15 | P1 |
| Recent activity | Last N transactions | `/api/activity` | None | P1 |
| Holding period | Value-weighted age, oldest lot, approaching-1yr | `/api/portfolio/positions` (lot-level) | Small — §14 | P1 |

## 12. Sync freshness — explicit states

Beyond "last synced at HH:MM," define real states so the dashboard can't misrepresent data health:

```text
Fresh              — last sync succeeded within the expected window
Partially priced   — sync succeeded but some products failed to price
Stale              — last successful sync is older than expected
Sync in progress
Last sync failed
```

Distinguish **last attempted sync** from **last successful sync** explicitly — a failed sync must never make the dashboard imply data was just refreshed.

**Partial pricing default:** if a product fails to price, use its **last known-good price** and mark that position `priceStatus: "stale"` (§8) — visible in the UI as a small indicator on that position, not hidden. Never silently drop the position or treat a missing price as `0`; either would corrupt total value and allocation without any visible sign something's wrong.

## 13. Product categorization

Ordered keyword/regex rules over the product name, confirmed as the approach — but with an escape hatch, per review, so one oddly-named product doesn't force increasingly fragile regex:

```text
effective_category = category_override ?? inferred_category
```

`inferred_category` comes from the rule list; `category_override` is a manual per-product field, empty by default. Category set, expanded per review to avoid over-grouping distinct product types:

```text
Booster Box
Booster Bundle     (kept separate from Booster Box — different products)
ETB
Tin
Collection Box
Blister
Specialty
Uncategorized      (explicit fallback — never silently misclassify)
```

Build the rule list as its own small module (`[{pattern, category}]`, evaluated in order, easy to append to), and maintain a small test suite that runs the rules against the full known product catalog — not just your current 18–20 holdings — so a new set's naming convention doesn't silently land in the wrong bucket or fall through to Uncategorized without you noticing.

## 14. Holding period — lot-level

"Average days held" is ambiguous once a position has multiple purchase dates at different ages (e.g. 1 box from 350 days ago, 10 boxes from yesterday). Metrics need to be lot-based even though the UI aggregates by position:

- **Value-weighted average age** — each open lot's age weighted by its current value, more representative than a naive average of purchase dates.
- **Oldest open lot** — simplest, most understandable "how long have I been holding this" fact.
- **Approaching one year** — a concrete window, not a vague label: lots between **335 and 364 days old**, relevant for long- vs. short-term capital gains planning.

## 15. Holdings heatmap — edge cases

Definition, stated explicitly:

```text
Cell  = one aggregated position
Size  = current market value
Color = 1M Value Change (§6), clamped to a fixed domain (±25%) so one extreme mover
        doesn't flatten the color scale for everything else
```

Edge cases that need defined behavior, not left to whoever implements it:

- No 1-month price history for a position → render as **Unknown** (a distinct neutral/hatched state), never as 0% — a real 0% change and "we don't have the data" are different facts and must look different.
- Missing or stale current price → same explicit stale treatment as §12, visible on the tile, not just in a tooltip.
- Tooltip always contains product name, units held, current value, and the change figure — no relying on color alone to convey state (accessibility requirement, applies here and globally per the dataviz method already used to build the wireframe).

## 16. Actual vs. Projected chart — semantics

The wireframe overlays Actual and Projected as two lines; the mechanics need to be defined before that's buildable:

- **What generates Projected:** current holdings' quantities applied to historical prices — i.e., "what would my portfolio have been worth on each past date if I held exactly what I hold today" (matches the existing app's own definition, carried forward unchanged).
- **Where it begins / historical extent:** Projected is computed over the same historical window as Actual — it's a full alternate series, not a forward-looking forecast, so the two lines can and do diverge anywhere in the window (not just "before vs. after a split point").
- **Does new inventory affect it:** yes — Projected always reflects *current* holdings, so it changes retroactively whenever you buy or sell (this is a mutation-triggered recompute per §7, not just a price-sync-triggered one).
- **Per-holding or aggregate:** aggregate only for the dashboard chart; a per-holding projected line isn't in scope here.
- **Visual rule:** Actual = solid line, Projected = dashed line, both direct-labeled (2 series ⇒ legend required per the dataviz method already applied to the wireframe). The lines are expected to overlap/cross — that's meaningful, not a rendering bug.

## 17. Insight lifecycle

The review's most important correction: **seen is not resolved.** These need to be separate concepts, or the "idempotency" requirement from v2 is underspecified. Four distinct states per insight:

```text
Condition   — the underlying fact (e.g. "this position is ≥20% of portfolio"), true/false at any given moment
Event       — created when a condition transitions (not while it merely persists)
Seen        — you've viewed it on the dashboard
Resolved    — the underlying condition is no longer true
```

Worked example (concentration):

```text
Mon  position crosses 20%        → EVENT CREATED
Tue  still 22%                   → no new event
Wed  you open the dashboard      → event marked SEEN
Thu  still 23%                   → condition remains ACTIVE, event remains SEEN
Fri  falls to 18%                → condition RESOLVED
Sun  rises back to 21%           → NEW EVENT (crossing again)
```

Seeing it on Wednesday doesn't mean the concentration went away — it's still active through Thursday. Conflating "seen" with "resolved" would make the panel silently stop telling you about a risk that's still true.

### Insight record fields

```text
type            (signal_transition | outsized_move | concentration | drawdown)
entity_id       (position/lot reference)
state           (active | resolved)
severity        (§19)
triggered_at
resolved_at
seen_at
snapshot_id     (§9 — which published snapshot this event was computed from)
dedupe_key      (prevents duplicate events for the same condition instance)
payload         (rule-specific detail, e.g. from_signal/to_signal, threshold crossed)
```

When the notification worker is built later, delivery gets its **own** fields, kept distinct from whether the condition is still active — `web_seen_at`, `push_delivered_at`, `email_delivered_at`. Seeing it on web shouldn't suppress a push notification, and vice versa; those are different questions.

## 18. Insight rules — explicit per-rule semantics

Thresholds confirmed to start (named constants, one-line change later, no settings UI needed yet):

```text
OUTSIZED_MOVE_THRESHOLD  = 10%
CONCENTRATION_THRESHOLD  = 20%
DRAWDOWN_THRESHOLD       = 15%
```

**Signal transition.** First-ever computed signal for a position creates **no** transition event — there's nothing to transition from. `Cooling → Declining` creates one event. Repeated `Declining → Declining` (recomputed but unchanged) creates none. `Declining → Recovering` creates another. Store `from_signal` and `to_signal` explicitly, not just "a signal changed" — the direction is the useful part.

**Outsized move.** Modeled as a state machine, not a per-sync check, so three consecutive days above the threshold don't create three events:

```text
states: NORMAL, OUTSIZED_UP, OUTSIZED_DOWN
event only on a state transition:
  NORMAL → OUTSIZED_UP
  NORMAL → OUTSIZED_DOWN
  OUTSIZED_UP → NORMAL
  OUTSIZED_DOWN → NORMAL
```

Magnitude tiers (e.g. distinguishing a 12% move from a 40% move beyond just "outsized") can be added later without changing this structure.

**Concentration.** Crossing semantics, explicit:

```text
<20%  → ≥20%   = new event
≥20%  → ≥20%   = no event (still active, not re-fired)
≥20%  → <20%   = resolved
<20%  → ≥20%   = new event (again — re-crossing after resolution is a fresh event)
```

**Drawdown.** Triggers at `DRAWDOWN_THRESHOLD = 15%` below **Tracked ATH** — renamed from "all-time high" per review, since it's the highest price *Pokéfolio has recorded*, not necessarily the product's true historical high (Pokéfolio doesn't have complete historical market data predating its own tracking). The UI and API should say "Tracked ATH" so it's never read as a stronger claim than the data supports.

## 19. What Changed — severity, not fixed priority

Renamed from "Needs Attention": the panel legitimately includes positive information (a signal recovering, an outsized gain), and calling the whole thing "Needs Attention" mislabels the good news. **What Changed** is the umbrella section; items within it are categorized:

```text
⚠  Needs attention   — negative transitions, outsized down moves, concentration, drawdown
↗  Positive           — outsized up moves, positive resolutions
↻  Signal change      — neutral transitions (e.g. Declining → Recovering, in progress)
```

Fixed category priority (transitions, then moves, then concentration/drawdown, as in v2) can misorder a minor signal flip above a genuine −42% move. Replaced with deterministic numeric severity, computed the same way every time:

```text
signal negative transition     base 70
signal recovery                base 35
outsized negative move         50 + magnitude
outsized positive move         30 + magnitude
concentration crossing         60 + excess-over-threshold
drawdown                       40 + drawdown magnitude
```

Weights are illustrative and tunable — the requirement is that severity is a deterministic function of the event, and the panel sorts by it descending. **The display cap of 5 applies only to what's rendered, never to what's stored or counted** — every event is persisted regardless of whether it makes the visible list:

```text
What Changed · 5 shown / 8 total          [View all]
```

Discarding events at the storage layer because only five rows fit on screen would quietly break both the notification worker (which needs the full event log later) and any future "view all" UI.

## 20. Insights: rule-based, not LLM

None of this should be LLM-powered — signals, outsized moves, concentration, drawdown are all deterministic arithmetic over data already in the sync/mutation pipeline. An LLM adds latency, cost, and a real chance of misstating a number, for a task that's pure calculation.

Where an LLM would help, later: narrating a handful of already-computed, already-correct events into digest prose for a notification — "your Paldean Fates Mini Tin cooled off after being your best performer this month." That's language synthesis over facts the Analytics Engine already produced and persisted as structured events (§17), fed in as input — it can't hallucinate a percentage it never calculated. This slots in at the notification-worker layer later and changes nothing about §7–19 above.

## 21. Non-functional requirements

- **Correctness:** during migration, dashboard calculations must match the existing Data and Compare page calculations exactly — this is a relocation of logic, not a silent recalculation with different assumptions.
- **Atomicity:** only fully-published snapshots (§9) are ever readable by any endpoint.
- **Idempotency:** rerunning the Analytics Engine against identical input state produces zero duplicate insight events — guaranteed by the state-machine/crossing semantics in §18, not by ad hoc deduplication.
- **Observability:** every sync or analytics run records `run_id, started_at, completed_at, status, products_requested, products_updated, products_failed, insights_created`.
- **Failure isolation:** one product failing to price must not block every other product from updating, and must not fail the whole sync run.
- **API behavior:** a dashboard or API request never triggers an external pricing API call. External pricing stays isolated to the sync/ingestion layer — the dashboard only ever reads already-published snapshots. (This also protects the existing 100/day pricing-API budget from being accidentally coupled to dashboard traffic.)
- **Performance:** aggregations over ≤~50 positions; no concern at current or 10x scale. Reading from a pre-computed, published snapshot means dashboard and future mobile requests are cheap regardless of client.

## 22. Suggested phasing

Reordered from v2: the Insights/"What Changed" work is the feature most directly tied to the redesign's actual value proposition ("understand what changed, then leave"), so it should ship earlier rather than after several rounds of pure-display work.

1. **Phase 0 — Foundations.** Domain & metric definitions (§6) locked; API contracts (§8) and snapshot model (§9) stood up in front of *existing* data, even before anything new is computed. Unglamorous, highest-leverage — everything else, including mobile later, becomes additive on top of this.
2. **Phase 1 — Dashboard foundation.** Value + freshness header, timeframe row, value chart (Actual/Projected overlay), portfolio strip — all served through the Phase 0 API.
3. **Phase 2 — Insights MVP.** Analytics Engine reacting to price sync + mutations; signal transitions and outsized-move rules; What Changed panel (severity-sorted, capped-for-display-only).
4. **Phase 3 — Portfolio context.** Allocation (with categorization rules, §13), recent activity, holding period (lot-level, §14).
5. **Phase 4 — Rich visualization & expanded insight rules.** Heatmap (with edge cases, §15), concentration and drawdown rules, any additional insight types.
6. **Fast-follow (out of scope here, unlocked by the above).** Notification worker reading unseen/unresolved events; mobile app calling the same domain API; true cash-flow-adjusted Investment Performance (§6); per-holding target prices as a new insight rule.

## 23. Acceptance criteria

Testable, replacing the softer "success criteria" from v2:

- **Dashboard completeness:** a normal check-in requires no navigation to Compare, Data, or Settings to determine current value, recent Value Change, data freshness, and any new What Changed items.
- **Snapshot correctness:** every price-derived value in a single dashboard response references the same published `snapshotId`.
- **Insight idempotency:** reprocessing identical portfolio data produces zero duplicate insight events.
- **Transition correctness:** `A → B` produces exactly one event; repeated `B → B` produces none; a later `B → A` produces exactly one new event.
- **Mutation freshness:** adding, editing, or deleting a transaction updates transaction-derived metrics (value, cost basis, concentration) without waiting for the next scheduled price sync.
- **Graceful partial data:** a failed or missing product price never silently renders as `0` or `Unknown-as-zero`, and never makes the rest of the dashboard unusable.
- **API reuse:** no financial or insight calculation is independently reimplemented across web, mobile, or the notification worker — all three read the same domain API / event log.
- **Labeling correctness:** every timeframe/performance figure in the UI and API is labeled and named as Value Change, never Return or Performance, until §6's deferred true-performance metric is actually built.

## 24. Pre-implementation checklist

- [ ] Domain terms (portfolio, holding/position, lot) — defined, §6
- [ ] Dashboard scope (all portfolios by default, switcher to one) — defined, §6
- [ ] Cost basis, realized/unrealized P/L, net cash flow — defined, §6
- [ ] Value Change vs. Investment Performance — resolved, v1 ships Value Change only, §6
- [ ] Canonical domain-oriented API endpoints — defined, §8
- [ ] Response envelope + data-format conventions (percent, money, dates, missing data) — defined, §8
- [ ] Snapshot ID + atomic publish semantics — defined, §9
- [ ] Analytics Engine triggers on price sync **and** transaction mutations — defined, §7
- [ ] Insight condition / event / seen / resolved states separated — defined, §17
- [ ] Insight record schema (incl. `dedupe_key`, `snapshot_id`) — defined, §17
- [ ] Signal-transition first-run behavior — defined, §18
- [ ] Outsized-move state machine — defined, §18
- [ ] Concentration crossing/resolution semantics — defined, §18
- [ ] Drawdown threshold + "Tracked ATH" naming — defined, §18
- [ ] Deterministic severity scoring, display cap ≠ storage cap — defined, §19
- [ ] Panel naming: **What Changed** (umbrella) with categorized rows — defined, §19
- [ ] Insights moved earlier in phasing — defined, §22
- [ ] Manual category override field — defined, §13
- [ ] Booster Box vs. Booster Bundle kept separate — defined, §13
- [ ] Sync states + last-attempted vs. last-successful — defined, §12
- [ ] Partial/stale pricing default behavior — defined, §12
- [ ] Lot-level holding-period metrics — defined, §14
- [ ] Heatmap missing-history / stale-price / clamped-color behavior — defined, §15
- [ ] Actual vs. Projected chart semantics — defined, §16
- [ ] Observability fields for every sync/analytics run — defined, §21
- [ ] Failure isolation (one bad price ≠ failed sync) — defined, §21
- [ ] Acceptance criteria are deterministic and testable — defined, §23
