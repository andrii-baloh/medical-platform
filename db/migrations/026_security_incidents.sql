BEGIN;

CREATE TABLE security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type text NOT NULL CHECK (incident_type IN ('unauthorized_access','data_disclosure','malware','account_compromise','availability','integrity','other')),
  title varchar(200) NOT NULL CHECK (length(trim(title)) > 0),
  description varchar(4000) NOT NULL DEFAULT '',
  detected_at timestamptz NOT NULL DEFAULT now(),
  occurred_at timestamptz,
  affected_systems text[] NOT NULL DEFAULT '{}',
  affected_data_categories text[] NOT NULL DEFAULT '{}',
  affected_users_estimate integer CHECK (affected_users_estimate IS NULL OR affected_users_estimate >= 0),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','triage','contained','investigating','resolved','closed')),
  personal_data_breach text NOT NULL DEFAULT 'undetermined' CHECK (personal_data_breach IN ('undetermined','confirmed','ruled_out')),
  rights_affected boolean NOT NULL DEFAULT false,
  investigator_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  containment_actions varchar(4000) NOT NULL DEFAULT '',
  final_report varchar(8000),
  regulator_notification text NOT NULL DEFAULT 'not_assessed' CHECK (regulator_notification IN ('not_assessed','not_required','required','initial_submitted','final_submitted')),
  initial_notified_at timestamptz,
  final_notified_at timestamptz,
  initial_reference varchar(200),
  final_reference varchar(200),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_notification_consistency CHECK (
    (initial_notified_at IS NULL OR initial_reference IS NOT NULL)
    AND (final_notified_at IS NULL OR final_reference IS NOT NULL)
    AND (final_notified_at IS NULL OR initial_notified_at IS NOT NULL)
  ),
  CONSTRAINT incident_notification_required CHECK (
    regulator_notification NOT IN ('required','initial_submitted','final_submitted')
    OR (personal_data_breach='confirmed' AND rights_affected=true)
  )
);
CREATE INDEX security_incidents_status_detected_idx ON security_incidents(status,detected_at DESC);
CREATE INDEX security_incidents_breach_idx ON security_incidents(personal_data_breach,detected_at DESC);

CREATE TABLE security_incident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES security_incidents(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  action varchar(64) NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX security_incident_events_history_idx ON security_incident_events(incident_id,id);

CREATE FUNCTION security_incident_events_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Incident event history is append-only';
END;
$$;
CREATE TRIGGER security_incident_events_immutable
BEFORE UPDATE OR DELETE ON security_incident_events
FOR EACH ROW EXECUTE FUNCTION security_incident_events_immutable_guard();

COMMIT;
