-- Adds invoice-level discount fields. Discount does NOT reduce the tax base
-- (tax is computed per line on the full line amount; discount is subtracted
-- separately) — see backend/README.md "Invoice totals" section for why.

ALTER TABLE invoices
  ADD COLUMN discount_type  TEXT CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN discount_value NUMERIC(12,2) NOT NULL DEFAULT 0;
