-- Run on isolated development database only. All inserted rows roll back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  actor uuid;
  incident uuid;
  event_id bigint;
  blocked boolean := false;
BEGIN
  SELECT id INTO actor FROM app_users ORDER BY created_at LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'No development actor available'; END IF;
  INSERT INTO security_incidents(incident_type,title,severity,created_by_user_id,personal_data_breach,rights_affected,regulator_notification)
  VALUES('unauthorized_access','STAGE21 TRANSACTION TEST','high',actor,'confirmed',true,'required')
  RETURNING id INTO incident;
  INSERT INTO security_incident_events(incident_id,actor_user_id,action,details)
  VALUES(incident,actor,'test_created','{"test":true}')
  RETURNING id INTO event_id;
  BEGIN
    UPDATE security_incident_events SET action='tampered' WHERE id=event_id;
  EXCEPTION WHEN raise_exception THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Timeline UPDATE was not blocked'; END IF;
  blocked := false;
  BEGIN
    DELETE FROM security_incident_events WHERE id=event_id;
  EXCEPTION WHEN raise_exception THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Timeline DELETE was not blocked'; END IF;
  IF NOT EXISTS (SELECT 1 FROM security_incidents WHERE id=incident) THEN
    RAISE EXCEPTION 'Incident missing';
  END IF;
  RAISE NOTICE 'STAGE21_DB_INTEGRATION_PASS';
END $$;
ROLLBACK;
