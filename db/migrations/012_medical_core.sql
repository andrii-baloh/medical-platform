BEGIN;

-- Stage 1 / Medical Core: introduce a medical case that is distinct from the booking.
-- organization_id is intentionally nullable until the full MedicalOrganization model is delivered;
-- this avoids inventing legal organization data for legacy appointments.
CREATE TABLE IF NOT EXISTS medical_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  organization_id uuid,
  encounter_type text NOT NULL CHECK (encounter_type IN (
    'primary_remote','followup_remote','offline_reference','monitoring','consultation_review','legacy_unspecified'
  )),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled','waiting','active','completed','cancelled','no_show','requires_offline_visit'
  )),
  started_at timestamptz,
  completed_at timestamptz,
  complaints text,
  anamnesis text,
  chronic_conditions text,
  allergies text,
  current_medications text,
  examination_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  clinical_assessment text,
  recommendations text,
  required_tests text,
  need_offline_visit boolean NOT NULL DEFAULT false,
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_date date,
  doctor_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  CHECK (follow_up_required OR follow_up_date IS NULL),
  CHECK (status <> 'requires_offline_visit' OR need_offline_visit = true)
);

CREATE INDEX IF NOT EXISTS idx_medical_encounters_patient ON medical_encounters(patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_encounters_doctor ON medical_encounters(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_encounters_status ON medical_encounters(status, created_at DESC);

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS encounter_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='consultations_encounter_id_fkey' AND conrelid='consultations'::regclass
  ) THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_encounter_id_fkey
      FOREIGN KEY (encounter_id) REFERENCES medical_encounters(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultations_encounter ON consultations(encounter_id) WHERE encounter_id IS NOT NULL;

-- Backfill legacy bookings without pretending that their historical consultation type is known.
INSERT INTO medical_encounters(
  appointment_id,patient_profile_id,doctor_id,encounter_type,status,started_at,completed_at,
  complaints,anamnesis,clinical_assessment,recommendations,created_at,updated_at
)
SELECT
  a.id,a.patient_profile_id,a.doctor_id,'legacy_unspecified',
  CASE a.status
    WHEN 'confirmed' THEN 'scheduled'
    WHEN 'patient_checked_in' THEN 'waiting'
    WHEN 'in_progress' THEN 'active'
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled_by_patient' THEN 'cancelled'
    WHEN 'cancelled_by_doctor' THEN 'cancelled'
    WHEN 'no_show' THEN 'no_show'
    ELSE 'scheduled'
  END,
  c.started_at,c.ended_at,c.complaints,c.anamnesis,c.assessment,c.recommendations,
  a.created_at,GREATEST(a.updated_at,coalesce(c.updated_at,a.updated_at))
FROM appointments a
LEFT JOIN consultations c ON c.appointment_id=a.id
ON CONFLICT (appointment_id) DO NOTHING;

UPDATE consultations c
SET encounter_id=e.id
FROM medical_encounters e
WHERE e.appointment_id=c.appointment_id AND c.encounter_id IS NULL;

COMMIT;
