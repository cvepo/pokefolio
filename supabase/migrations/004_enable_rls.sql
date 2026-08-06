-- 004_enable_rls.sql
--
-- Locks the public anon key out of the database.
--
-- ===========================================================================
-- DO NOT RUN THIS UNTIL Settings → "Database access" says "service-role".
-- ===========================================================================
-- The anon key is embedded in the browser bundle (NEXT_PUBLIC_*), so anyone
-- who opens devtools can read it and, with RLS off, read and write every table
-- directly — bypassing the password gate in proxy.ts entirely. This migration
-- closes that hole.
--
-- Order of operations (getting this wrong takes the app down):
--   1. Copy the service_role key from Supabase → Project Settings → API Keys.
--   2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local AND in Vercel → Environment
--      Variables. It must NOT have a NEXT_PUBLIC_ prefix, or it ships to the
--      browser and this whole exercise is pointless.
--   3. Redeploy.
--   4. Open Settings and confirm "Database access" reads "service-role".
--   5. Only then run this file.
--
-- Why no policies: every query in this app runs server-side through /api/*
-- routes using the service-role key, which bypasses RLS by design. The browser
-- never queries Supabase directly. So "RLS enabled, zero policies" means the
-- anon key can do nothing at all, which is exactly what we want. There is no
-- ownership column on portfolios and no auth.users integration, so user-scoped
-- policies are not applicable here — this is a single-user app whose access
-- control lives in proxy.ts.
--
-- Rollback, if something breaks:
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;   -- for each table below

ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings        ENABLE ROW LEVEL SECURITY;

-- Verify: this should return rowsecurity = true for all seven tables.
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- Then confirm the lockout actually worked — with the ANON key, this must
-- return an empty array rather than your data:
--   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/portfolios?select=*" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
