BEGIN;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','skipped')),
  provider text,
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  claimed_by text,
  claim_expires_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_claimable
  ON notification_deliveries(created_at)
  WHERE status IN ('pending','failed','sending');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON notification_deliveries(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION enqueue_notification_email_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app_users
    WHERE id = NEW.user_id AND email IS NOT NULL AND status = 'active'
  ) THEN
    INSERT INTO notification_deliveries(notification_id,user_id,channel)
    VALUES (NEW.id,NEW.user_id,'email')
    ON CONFLICT (notification_id,channel) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_enqueue_email ON notifications;
CREATE TRIGGER trg_notifications_enqueue_email
AFTER INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION enqueue_notification_email_delivery();

COMMIT;
