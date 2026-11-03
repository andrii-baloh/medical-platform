BEGIN;

-- Stage 21: security incident workflow.
--
-- The incident record exists to help the organization collect the information
-- required for mandatory notifications. It stores technical facts and decisions,
-- not clinical content: affected users are counted, affected data is described by
-- classification, never by copying patient records into an incident log.
CREATE TABLE IF NOT EXISTS security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  incident_type text NOT NULL CHECK (length(incident_type) BETWEEN 3 AND 80),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','contained','reported','closed')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  summary text,
  affected_systems text[] NOT NULL DEFAULT ARRAY[]::text[],
  affected_data_classes text[] NOT NULL DEFAULT ARRAY[]::text[],
  affected_users_count integer CHECK (affected_users_count IS NULL OR affected_users_count >= 0),
  investigator_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  containment_actions text,
  reporting_deadline timestamptz,
  regulator_notified_at timestamptz,
  regulator_reference text,
  final_report text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_status
  ON security_incidents(status, detected_at DESC);

CREATE TABLE IF NOT EXISTS security_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('detected','status_changed','note','containment','notified','report_attached')),
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_security_incident_events_incident
  ON security_incident_events(incident_id, occurred_at);

COMMIT;
