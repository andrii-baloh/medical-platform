BEGIN;

-- Stage 14 completion: align the payment state model with the roadmap states
-- (created/pending/paid/failed/refunded/partially_refunded/cancelled) without
-- creating a second payment subsystem.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('created','pending','authorized','paid','failed','refunded','partially_refunded','cancelled'));

-- Fiscal attributes returned by the KKT operator once a receipt is registered
-- (54-ФЗ). They are stored on the existing receipt queue row from migration 027.
ALTER TABLE payment_fiscal_receipts
  ADD COLUMN IF NOT EXISTS fiscal_fn_number text,
  ADD COLUMN IF NOT EXISTS fiscal_document_number text,
  ADD COLUMN IF NOT EXISTS fiscal_document_attribute text,
  ADD COLUMN IF NOT EXISTS fiscal_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_phone text;

CREATE INDEX IF NOT EXISTS idx_payment_fiscal_receipts_payment
  ON payment_fiscal_receipts(payment_id, created_at DESC);

-- Raw inbound provider callbacks. The normalized payment_events stream stays the
-- idempotency boundary; this table keeps the exact received payload hash so a
-- disputed or unparsable callback can still be reviewed without clinical data.
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  payload_sha256 text NOT NULL,
  external_event_id text,
  signature_present boolean NOT NULL DEFAULT false,
  signature_valid boolean,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','duplicate','rejected','failed')),
  error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, payload_sha256)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_received
  ON payment_webhooks(provider, received_at DESC);

COMMIT;
