-- =====================================================================
-- Dashboard 2.0 — combined setup script
--
-- Convenience bundle of migrations 005-008, concatenated in order so the
-- whole thing can be pasted into the Supabase SQL editor in one go. It is
-- NOT itself a migration: supabase/migrations/005-008 remain the source of
-- truth, and this file is generated from them.
--
-- Safe to run more than once — every statement is IF NOT EXISTS or an
-- idempotent ALTER.
--
-- After running this, trigger a sync (or add/edit any transaction) to
-- publish the first analytics snapshot. /dashboard-v2 stays empty until a
-- snapshot exists, and will tell you so.
-- =====================================================================


-- ---------------------------------------------------------------
-- 005_analytics_snapshots.sql
-- ---------------------------------------------------------------

-- 005_analytics_snapshots.sql
-- Adds atomically published Dashboard 2.0 analytics runs and their observability data.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of                 timestamptz NOT NULL,
  scope_portfolio_id    uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  source_sync_run_id    uuid REFERENCES sync_runs(id) ON DELETE SET NULL,
  source_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'published', 'failed')),
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  error                 text,
  products_requested    integer NOT NULL DEFAULT 0,
  products_updated      integer NOT NULL DEFAULT 0,
  products_failed       integer NOT NULL DEFAULT 0,
  insights_created      integer NOT NULL DEFAULT 0,
  summary               jsonb,
  performance           jsonb,
  allocation            jsonb,
  activity              jsonb,
  sync_status           jsonb,
  CHECK (source_sync_run_id IS NULL OR source_transaction_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_published
  ON analytics_snapshots (scope_portfolio_id, as_of DESC)
  WHERE status = 'published';

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------
-- 006_snapshot_positions.sql
-- ---------------------------------------------------------------

-- 006_snapshot_positions.sql
-- Materialises every position belonging to a Dashboard 2.0 analytics snapshot.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS snapshot_positions (
  snapshot_id uuid NOT NULL REFERENCES analytics_snapshots(id) ON DELETE CASCADE,
  product_id  text NOT NULL REFERENCES products(id),
  position    jsonb NOT NULL,
  PRIMARY KEY (snapshot_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_positions_product
  ON snapshot_positions (product_id);

ALTER TABLE snapshot_positions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------
-- 007_insight_events.sql
-- ---------------------------------------------------------------

-- 007_insight_events.sql
-- Adds the durable insight event log and per-position transition state.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS insight_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('signal_transition', 'outsized_move', 'concentration', 'drawdown')),
  entity_id   text NOT NULL REFERENCES products(id),
  state       text NOT NULL CHECK (state IN ('active', 'resolved')),
  severity    numeric NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  seen_at     timestamptz,
  snapshot_id uuid NOT NULL REFERENCES analytics_snapshots(id) ON DELETE CASCADE,
  dedupe_key  text NOT NULL UNIQUE,
  payload     jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insight_events_state_severity
  ON insight_events (state, severity DESC, triggered_at DESC);

CREATE TABLE IF NOT EXISTS position_signal_state (
  product_id               text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  last_signal              text,
  last_outsized_move_state text NOT NULL DEFAULT 'NORMAL'
                            CHECK (last_outsized_move_state IN ('NORMAL', 'OUTSIZED_UP', 'OUTSIZED_DOWN')),
  last_concentration_state boolean,
  last_drawdown_state      boolean,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insight_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_signal_state ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------
-- 008_product_category_override.sql
-- ---------------------------------------------------------------

-- 008_product_category_override.sql
-- Adds the manual escape hatch for Dashboard 2.0 product categorisation.
-- Run once in the Supabase SQL editor.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_override text
  CHECK (category_override IS NULL OR category_override IN (
    'Booster Box', 'Booster Bundle', 'ETB', 'Tin',
    'Collection Box', 'Blister', 'Specialty', 'Uncategorized'
  ));

