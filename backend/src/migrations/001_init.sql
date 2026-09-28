-- Free Invoice Maker — initial schema
-- Phase 1 uses: users, businesses
-- Later phases use: stripe_accounts, clients, invoices, invoice_line_items, payments, webhook_events
-- All tables are created now so later phases are additive (new columns/tables only), never destructive.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- case-insensitive email

-- ─────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       CITEXT UNIQUE NOT NULL,
  password_hash               TEXT NOT NULL,
  email_verified              BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token    TEXT,
  email_verification_expires  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- businesses  (one per user, created during onboarding step 2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE businesses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name        TEXT NOT NULL,
  logo_url             TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  state                TEXT,
  postal_code          TEXT,
  country              TEXT DEFAULT 'US',
  phone                TEXT,
  email                TEXT,
  default_tax_rate     NUMERIC(6,3) NOT NULL DEFAULT 0,      -- percentage, e.g. 8.750
  default_payment_terms TEXT DEFAULT 'Due on receipt',
  next_invoice_number  INTEGER NOT NULL DEFAULT 1,           -- used to auto-increment invoice numbers
  onboarding_complete  BOOLEAN NOT NULL DEFAULT FALSE,       -- true once business profile step is done
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- stripe_accounts  (Phase: Stripe Connect onboarding)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE stripe_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  stripe_account_id    TEXT UNIQUE NOT NULL,
  onboarding_type      TEXT NOT NULL CHECK (onboarding_type IN ('express', 'standard')),
  charges_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- clients  (Phase: invoice CRUD)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          CITEXT,
  phone          TEXT,
  address_line1  TEXT,
  address_line2  TEXT,
  city           TEXT,
  state          TEXT,
  postal_code    TEXT,
  country        TEXT DEFAULT 'US',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_business_id ON clients(business_id);

-- ─────────────────────────────────────────────────────────────
-- invoices  (Phase: invoice CRUD)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  invoice_number    INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','viewed','processing','paid','overdue','void')),
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(6,3),                   -- per-invoice override of business default; null = use business default
  currency          TEXT NOT NULL DEFAULT 'usd',
  amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0, -- full-payment-only for now, but tracked for refunds/partial-future
  due_date          DATE,
  notes             TEXT,
  payment_terms     TEXT,
  sent_at           TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  voided_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, invoice_number)
);
CREATE INDEX idx_invoices_business_id ON invoices(business_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);

-- ─────────────────────────────────────────────────────────────
-- invoice_line_items
-- ─────────────────────────────────────────────────────────────
CREATE TABLE invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate      NUMERIC(6,3),          -- per-line override; null = use invoice/business rate
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_line_items_invoice_id ON invoice_line_items(invoice_id);

-- ─────────────────────────────────────────────────────────────
-- payments  (Phase: payment collection methods)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id                 UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  method                      TEXT NOT NULL CHECK (method IN ('card','ach','cash','tap_to_pay')),
  amount                      NUMERIC(12,2) NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'usd',
  stripe_payment_intent_id    TEXT,
  stripe_checkout_session_id  TEXT,
  application_fee_amount      NUMERIC(12,2),
  status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),
  failure_reason              TEXT,
  refunded_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_business_id ON payments(business_id);
CREATE UNIQUE INDEX idx_payments_pi_unique ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- webhook_events  (idempotency guard for Stripe webhooks)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id   TEXT UNIQUE NOT NULL,
  type              TEXT NOT NULL,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- updated_at trigger helper, applied to every table with updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stripe_accounts_updated_at BEFORE UPDATE ON stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_line_items_updated_at BEFORE UPDATE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
