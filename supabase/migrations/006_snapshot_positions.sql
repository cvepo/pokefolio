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
