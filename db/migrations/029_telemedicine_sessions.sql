BEGIN;

-- Stage 15: the medical case of a remote consultation.
--
-- `video_rooms` stays the transport record (provider room, join tokens).
-- `telemedicine_sessions` is the clinical session linked to the appointment
-- and, once created, to the medical encounter, so a video call is never a
-- standalone chat room without a clinical context.
CREATE TABLE IF NOT EXISTS telemedicine_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  encounter_id uuid UNIQUE REFERENCES medical_encounters(id) ON DELETE SET NULL,
  video_room_id uuid UNIQUE REFERENCES video_rooms(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','waiting','active','completed','failed','cancelled')),
  technical_status text NOT NULL DEFAULT 'pending'
    CHECK (technical_status IN ('pending','ok','degraded','failed')),
  recording_status text NOT NULL DEFAULT 'not_recorded'
    CHECK (recording_status IN ('not_recorded','requested','recording','processing','available','failed','disabled')),
  patient_joined_at timestamptz,
  doctor_joined_at timestamptz,
  patient_left_at timestamptz,
  doctor_left_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  disconnect_count integer NOT NULL DEFAULT 0 CHECK (disconnect_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemedicine_sessions_status
  ON telemedicine_sessions(status, updated_at DESC);

-- Append-only session timeline: joins, leaves, reconnects, technical failures
-- and recording-state changes. No clinical text is stored here.
CREATE TABLE IF NOT EXISTS telemedicine_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES telemedicine_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'session_created','room_opened','participant_joined','participant_left',
    'connection_lost','reconnecting','technical_failure','recording_status_changed',
    'session_completed','session_failed','session_cancelled'
  )),
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  actor_role text CHECK (actor_role IN ('patient','doctor','system')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_telemedicine_session_events_session
  ON telemedicine_session_events(session_id, occurred_at);

COMMIT;
