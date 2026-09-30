BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_session_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment
  ON payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_session
  ON payments(provider, provider_session_id)
  WHERE provider_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text,
  UNIQUE (provider, provider_event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_active_appointment
  ON payments(appointment_id)
  WHERE status IN ('created','authorized','paid','partially_refunded');

CREATE INDEX IF NOT EXISTS idx_payment_events_payment
  ON payment_events(payment_id, received_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  provider_refund_id text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','succeeded','failed','cancelled')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  reason_code text,
  requested_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id, requested_at DESC);

COMMIT;
