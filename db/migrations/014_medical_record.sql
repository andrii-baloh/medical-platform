BEGIN;

CREATE TABLE IF NOT EXISTS medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id uuid NOT NULL UNIQUE REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS record_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id uuid NOT NULL REFERENCES medical_records(id) ON DELETE RESTRICT,
  source_encounter_id uuid NOT NULL REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  code text,
  code_system text,
  display text NOT NULL,
  clinical_status text NOT NULL DEFAULT 'active' CHECK (clinical_status IN ('active','resolved','entered_in_error')),
  diagnosed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by_doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_diagnoses_record ON record_diagnoses(medical_record_id, diagnosed_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_diagnoses_code ON record_diagnoses(code_system, code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS record_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id uuid NOT NULL REFERENCES medical_records(id) ON DELETE RESTRICT,
  source_encounter_id uuid NOT NULL REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  allergen text NOT NULL,
  reaction text,
  severity text CHECK (severity IS NULL OR severity IN ('mild','moderate','severe','unknown')),
  clinical_status text NOT NULL DEFAULT 'active' CHECK (clinical_status IN ('active','inactive','entered_in_error')),
  created_by_doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_allergies_record ON record_allergies(medical_record_id, created_at DESC);

CREATE TABLE IF NOT EXISTS record_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id uuid NOT NULL REFERENCES medical_records(id) ON DELETE RESTRICT,
  source_encounter_id uuid NOT NULL REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  medication_name text NOT NULL,
  dosage text,
  route text,
  frequency text,
  clinical_status text NOT NULL DEFAULT 'active' CHECK (clinical_status IN ('active','stopped','completed','entered_in_error')),
  started_at date,
  ended_at date,
  created_by_doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_record_medications_record ON record_medications(medical_record_id, created_at DESC);

CREATE TABLE IF NOT EXISTS record_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id uuid NOT NULL REFERENCES medical_records(id) ON DELETE RESTRICT,
  source_encounter_id uuid NOT NULL REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  test_code text,
  test_name text NOT NULL,
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','resulted','cancelled','entered_in_error')),
  ordered_at timestamptz NOT NULL DEFAULT now(),
  result_text text,
  resulted_at timestamptz,
  created_by_doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_tests_record ON record_tests(medical_record_id, ordered_at DESC);

INSERT INTO medical_records(patient_profile_id)
SELECT p.id FROM patient_profiles p
ON CONFLICT (patient_profile_id) DO NOTHING;

CREATE OR REPLACE FUNCTION ensure_medical_record_for_patient()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO medical_records(patient_profile_id) VALUES (NEW.id)
  ON CONFLICT (patient_profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_profile_medical_record ON patient_profiles;
CREATE TRIGGER patient_profile_medical_record
AFTER INSERT ON patient_profiles
FOR EACH ROW EXECUTE FUNCTION ensure_medical_record_for_patient();

COMMIT;
