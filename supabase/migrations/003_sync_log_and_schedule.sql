-- 003_sync_log_and_schedule.sql
-- Adds a permanent sync run log, a user-editable sync schedule, and repairs
-- three products whose JustTCG variant IDs went dead after a set re-slug.
-- Run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Permanent sync log
-- ---------------------------------------------------------------------------
-- One row per sync attempt, kept indefinitely. The UI reads the most recent
-- row to show "last sync" and never clears it, so the timestamp survives
-- reloads and deploys until the next run replaces it.

CREATE TABLE IF NOT EXISTS sync_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz,
  -- 'cron'   = fired by Vercel Cron on the schedule
  -- 'manual' = user pressed Sync now
  trigger                text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  -- 'success' = every held product priced
  -- 'partial' = some products failed to price
  -- 'failed'  = nothing priced / hard error
  -- 'skipped' = cron fired on a day not in the schedule (no API calls made)
  status                 text NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'skipped')),
  products_total         integer NOT NULL DEFAULT 0,
  products_synced        integer NOT NULL DEFAULT 0,
  products_failed        integer NOT NULL DEFAULT 0,
  snapshots_written      integer NOT NULL DEFAULT 0,
  history_points_written integer NOT NULL DEFAULT 0,
  backfilled_products    integer NOT NULL DEFAULT 0,
  api_requests_used      integer NOT NULL DEFAULT 0,
  api_daily_remaining    integer,
  api_monthly_remaining  integer,
  error                  text,
  -- per-product failure detail, e.g. [{"product_id":"...","reason":"no_sealed_variant"}]
  failures               jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);

-- ---------------------------------------------------------------------------
-- 2. App settings (single row)
-- ---------------------------------------------------------------------------
-- sync_days uses JS getDay() numbering: 0=Sunday … 6=Saturday, evaluated in
-- the timezone stored in sync_timezone so "Wednesday" means the user's
-- Wednesday, not UTC's.

CREATE TABLE IF NOT EXISTS app_settings (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sync_days     smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  sync_timezone text NOT NULL DEFAULT 'America/New_York',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Supabase turns RLS ON by default for new tables, so these two start locked
-- while the older tables are open. That is deliberately NOT reconciled here —
-- 004_enable_rls.sql brings every table to the same locked state once the app
-- is running on the service-role key. Until then the anon key cannot see these
-- two tables, and the app degrades gracefully: the schedule falls back to
-- "every day" and the sidebar reads "No sync recorded yet".
--
-- This INSERT runs as the service role in the SQL editor, so it succeeds even
-- with RLS active.
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Repair dead variant IDs
-- ---------------------------------------------------------------------------
-- JustTCG re-slugged several set IDs. These three held products still carry
-- the dead slug, so every price lookup for them has failed since 2026-05-11.
-- Verified live against the JustTCG API on 2026-08-06:
--   swsh-crown-zenith-…-booster-bundle_sealed        -> $221.53
--   swsh-crown-zenith-sea-sky-…_sealed               -> $381.30
--   sv-scarlet-violet-151-blooming-waters-…_sealed   -> $325.11
--
-- Only variant_id is changed. The product `id` stays as-is so existing
-- transactions and price_snapshots keep pointing at the same rows. The sync
-- route matches API responses by variant_id (not card id) for this reason.

UPDATE products
SET variant_id = 'pokemon-swsh-crown-zenith-crown-zenith-booster-bundle_sealed'
WHERE id = 'pokemon-crown-zenith-crown-zenith-booster-bundle';

UPDATE products
SET variant_id = 'pokemon-swsh-crown-zenith-sea-sky-premium-collection_sealed'
WHERE id = 'pokemon-crown-zenith-sea-sky-premium-collection';

UPDATE products
SET variant_id = 'pokemon-sv-scarlet-violet-151-blooming-waters-premium-collection_sealed'
WHERE id = 'pokemon-miscellaneous-cards-products-blooming-waters-premium-collection';

-- ---------------------------------------------------------------------------
-- Note on duplicate cache rows
-- ---------------------------------------------------------------------------
-- The same re-slug left 14 pairs of products rows sharing a tcgplayer_id
-- (old slug + new slug for the same physical product). None of the unused
-- twins are referenced by transactions, so they are harmless cache clutter
-- and are intentionally NOT deleted here — dropping rows referenced by
-- price_snapshots would need a cascade decision. Clean up separately if the
-- duplicates ever surface in search results.
