BEGIN;

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_outbox_claimable
  ON outbox_events(created_at)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_claim_expiry
  ON outbox_events(claim_expires_at)
  WHERE published_at IS NULL AND claim_expires_at IS NOT NULL;

COMMIT;
