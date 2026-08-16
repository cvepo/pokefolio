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
