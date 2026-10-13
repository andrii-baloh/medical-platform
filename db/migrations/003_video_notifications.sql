BEGIN;

CREATE TABLE IF NOT EXISTS video_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_room_id text NOT NULL,
  room_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','closed','failed')),
  opened_at timestamptz,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_rooms_status
  ON video_rooms(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS video_join_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_room_id uuid NOT NULL REFERENCES video_rooms(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  participant_role text NOT NULL CHECK (participant_role IN ('patient','doctor')),
  event_type text NOT NULL CHECK (event_type IN ('token_issued','joined','left')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_video_join_events_room
  ON video_join_events(video_room_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  patient_profile_id uuid REFERENCES patient_profiles(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe
  ON notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMIT;
