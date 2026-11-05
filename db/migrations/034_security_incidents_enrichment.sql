BEGIN;

-- Extend the already-applied DeepSeek migration 032; never replay ChatGPT 026.
ALTER TABLE security_incidents
  ADD COLUMN description varchar(4000) NOT NULL DEFAULT '',
  ADD COLUMN occurred_at timestamptz,
  ADD COLUMN affected_data_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN affected_users_estimate integer,
  ADD COLUMN personal_data_breach text NOT NULL DEFAULT 'undetermined'
    CHECK (personal_data_breach IN ('undetermined','confirmed','ruled_out')),
  ADD COLUMN rights_affected boolean NOT NULL DEFAULT false,
  ADD COLUMN regulator_notification text NOT NULL DEFAULT 'not_assessed'
    CHECK (regulator_notification IN ('not_assessed','not_required','required','initial_submitted','final_submitted')),
  ADD COLUMN initial_notified_at timestamptz,
  ADD COLUMN final_notified_at timestamptz,
  ADD COLUMN initial_reference varchar(200),
  ADD COLUMN final_reference varchar(200),
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN closed_at timestamptz;

UPDATE security_incidents SET
  description=left(coalesce(summary,''),4000),
  affected_data_categories=affected_data_classes,
  affected_users_estimate=affected_users_count,
  initial_notified_at=regulator_notified_at,
  initial_reference=left(regulator_reference,200)
WHERE TRUE;

UPDATE security_incidents
SET status=CASE WHEN status='open' THEN 'detected'
                WHEN status='reported' THEN 'resolved'
                ELSE status END
WHERE status IN ('open','reported');
ALTER TABLE security_incidents DROP CONSTRAINT IF EXISTS security_incidents_status_check;
ALTER TABLE security_incidents ADD CONSTRAINT security_incidents_status_check
  CHECK(status IN ('detected','triage','contained','investigating','resolved','closed'));
ALTER TABLE security_incidents ALTER COLUMN status SET DEFAULT 'detected';
ALTER TABLE security_incidents ADD CONSTRAINT incident_notifications_consistent CHECK (
  (initial_notified_at IS NULL OR initial_reference IS NOT NULL)
  AND (final_notified_at IS NULL OR final_reference IS NOT NULL)
  AND (final_notified_at IS NULL OR initial_notified_at IS NOT NULL)
);
ALTER TABLE security_incidents ADD CONSTRAINT incident_notification_breach_required CHECK (
  regulator_notification NOT IN ('required','initial_submitted','final_submitted')
  OR (personal_data_breach='confirmed' AND rights_affected=true)
);
CREATE INDEX idx_security_incidents_breach ON security_incidents(personal_data_breach,detected_at DESC);

ALTER TABLE security_incident_events
  ADD COLUMN action varchar(64) NOT NULL DEFAULT 'note',
  ADD COLUMN event_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE security_incident_events
SET action=event_type, event_at=occurred_at, details=jsonb_build_object('note',note);
ALTER TABLE security_incident_events ALTER COLUMN event_type SET DEFAULT 'note';
CREATE INDEX idx_security_incident_events_event_at ON security_incident_events(incident_id,event_at DESC);

CREATE FUNCTION security_incident_event_no_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Security incident timeline is append-only';
END;
$$;
CREATE TRIGGER security_incident_event_no_update_delete
BEFORE UPDATE OR DELETE ON security_incident_events
FOR EACH ROW EXECUTE FUNCTION security_incident_event_no_mutation();

COMMIT;
