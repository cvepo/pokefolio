-- Products cache (populated from JustTCG search and sync)
CREATE TABLE IF NOT EXISTS products (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  set_id          text NOT NULL,
  set_name        text NOT NULL,
  tcgplayer_id    text,
  variant_id      text NOT NULL,
  current_price   decimal(10,2),
  last_synced_at  timestamptz
);

-- Portfolios
CREATE TABLE IF NOT EXISTS portfolios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- Portfolio items (holdings)
CREATE TABLE IF NOT EXISTS portfolio_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id    uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  product_id      text REFERENCES products(id),
  quantity        integer NOT NULL DEFAULT 1,
  purchase_price  decimal(10,2) NOT NULL,
  purchase_date   date,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- Daily price history per product
CREATE TABLE IF NOT EXISTS price_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    text REFERENCES products(id),
  price         decimal(10,2) NOT NULL,
  snapshot_date date NOT NULL,
  UNIQUE(product_id, snapshot_date)
);

-- Daily total value per portfolio
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id  uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  total_value   decimal(10,2) NOT NULL,
  snapshot_date date NOT NULL,
  UNIQUE(portfolio_id, snapshot_date)
);

-- Index for fast snapshot range queries
CREATE INDEX IF NOT EXISTS idx_price_snapshots_product_date ON price_snapshots(product_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_portfolio_date ON portfolio_snapshots(portfolio_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_portfolio ON portfolio_items(portfolio_id);
