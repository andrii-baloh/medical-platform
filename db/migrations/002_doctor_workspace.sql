BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='appointment_slots_no_overlap' AND conrelid='appointment_slots'::regclass) THEN
    ALTER TABLE appointment_slots
      ADD CONSTRAINT appointment_slots_no_overlap
      EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS doctor_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  local_start time NOT NULL,
  local_end time NOT NULL,
  timezone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (local_end > local_start),
  UNIQUE (doctor_id, weekday, local_start, local_end)
);
CREATE INDEX IF NOT EXISTS idx_doctor_working_hours_doctor ON doctor_working_hours(doctor_id, weekday) WHERE active=true;

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  changed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_status_history ON appointment_status_history(appointment_id, created_at);

CREATE TABLE IF NOT EXISTS consultation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  snapshot jsonb NOT NULL,
  content_sha256 char(64) NOT NULL,
  previous_version_sha256 char(64),
  signed_at timestamptz NOT NULL,
  signed_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  signature_method text NOT NULL DEFAULT 'authenticated_account',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultation_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_consultation_versions_appointment ON consultation_versions(appointment_id, version_no DESC);

CREATE OR REPLACE FUNCTION prevent_consultation_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Signed consultation versions are immutable';
END;
$$;

DROP TRIGGER IF EXISTS consultation_versions_immutable_update ON consultation_versions;
CREATE TRIGGER consultation_versions_immutable_update
BEFORE UPDATE OR DELETE ON consultation_versions
FOR EACH ROW EXECUTE FUNCTION prevent_consultation_version_mutation();

COMMIT;
