-- 002_transactions.sql
-- Replaces portfolio_items with a transaction log supporting multiple buy/sell events per product.
-- Run this once in the Supabase SQL editor. Existing portfolio_items rows will be migrated as
-- single 'buy' transactions, then the old table is dropped.

-- 1. Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id     uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  product_id       text NOT NULL REFERENCES products(id),
  type             text NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity         integer NOT NULL CHECK (quantity > 0),
  price            decimal(10,2) NOT NULL CHECK (price >= 0),
  transaction_date date NOT NULL,
  notes            text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_product ON transactions(portfolio_id, product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);

-- 2. Migrate existing portfolio_items into transactions as 'buy' rows.
--    Wrapped in DO block so it gracefully no-ops if the table no longer exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portfolio_items') THEN
    INSERT INTO transactions (portfolio_id, product_id, type, quantity, price, transaction_date, notes, created_at)
    SELECT
      portfolio_id,
      product_id,
      'buy',
      quantity,
      purchase_price,
      COALESCE(purchase_date, created_at::date),
      notes,
      created_at
    FROM portfolio_items;
  END IF;
END $$;

-- 3. Drop the old table
DROP TABLE IF EXISTS portfolio_items;
