# Dashboard 2.0 backend notes

- The existing API has transaction creation and whole-product transaction deletion, but no transaction edit route. The rebuild wires analytics into every transaction mutation path that exists; if an edit endpoint is added during integration, it must call `publishAnalyticsSnapshot` for both combined and portfolio scopes after rebuilding historical portfolio snapshots.
- The checked-in product-category fixture uses the known catalog names already present in repository history and the PRD examples. The execution environment did not permit a safe live database export, so the integrator should replace or extend that fixture from the full production `products.name` catalog when applying the migrations.
- `POST /api/insights/seen` has no success-response type in `contract.ts`. It returns `{ ok: true, updated: number }`; empty `eventIds` is a successful no-op as required.
