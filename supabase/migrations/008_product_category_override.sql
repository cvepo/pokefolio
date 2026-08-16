-- 008_product_category_override.sql
-- Adds the manual escape hatch for Dashboard 2.0 product categorisation.
-- Run once in the Supabase SQL editor.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_override text
  CHECK (category_override IS NULL OR category_override IN (
    'Booster Box', 'Booster Bundle', 'ETB', 'Tin',
    'Collection Box', 'Blister', 'Specialty', 'Uncategorized'
  ));
