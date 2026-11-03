BEGIN;

CREATE SEQUENCE IF NOT EXISTS payment_provider_reference_seq AS bigint START WITH 100001;

CREATE TABLE IF NOT EXISTS payment_provider_references (
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  external_reference bigint NOT NULL DEFAULT nextval('payment_provider_reference_seq'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_id, provider),
  UNIQUE (provider, external_reference),
  CHECK (external_reference > 0)
);

COMMIT;
