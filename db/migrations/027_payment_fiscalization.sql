BEGIN;

CREATE SEQUENCE IF NOT EXISTS payment_fiscal_receipt_seq AS bigint START WITH 1000000001;

CREATE TABLE IF NOT EXISTS payment_fiscal_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  receipt_type text NOT NULL CHECK (receipt_type IN ('prepayment','full_payment')),
  external_receipt_id bigint NOT NULL DEFAULT nextval('payment_fiscal_receipt_seq'),
  origin_external_reference bigint,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','submitted','confirmed','failed','not_provided')),
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_response jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  claimed_at timestamptz,
  claimed_by text,
  claim_expires_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_receipt_id),
  UNIQUE (payment_id, receipt_type)
);

CREATE INDEX IF NOT EXISTS idx_payment_fiscal_receipts_work
  ON payment_fiscal_receipts(status,created_at)
  WHERE status IN ('pending','failed','submitted');

CREATE INDEX IF NOT EXISTS idx_payment_fiscal_receipts_appointment
  ON payment_fiscal_receipts(appointment_id,created_at DESC);

COMMIT;