BEGIN;

-- Stage 1 hardening: encounter lifecycle and appointment-less medical cases.
-- 012 has already been applied; this migration is intentionally additive.
ALTER TABLE medical_encounters
  ALTER COLUMN appointment_id DROP NOT NULL;

ALTER TABLE medical_encounters
  DROP CONSTRAINT IF EXISTS medical_encounters_appointment_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_medical_encounters_appointment
  ON medical_encounters(appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE medical_encounters
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS medical_encounter_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN (
    'scheduled','waiting','active','completed','cancelled','no_show','requires_offline_visit'
  )),
  changed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_encounter_status_history
  ON medical_encounter_status_history(encounter_id, created_at);

INSERT INTO medical_encounter_status_history(encounter_id,from_status,to_status,reason)
SELECT e.id,NULL,e.status,'migration_013_baseline'
FROM medical_encounters e
WHERE NOT EXISTS (
  SELECT 1 FROM medical_encounter_status_history h WHERE h.encounter_id=e.id
);

COMMIT;
