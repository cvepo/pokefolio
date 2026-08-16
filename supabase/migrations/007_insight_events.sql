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
