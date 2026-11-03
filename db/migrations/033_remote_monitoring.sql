BEGIN;

-- Stage 22: remote patient monitoring.
--
-- Monitoring is an extension of the clinical encounter, not a separate health
-- record: measurements belong to an enrollment that is owned by a program and a
-- treating doctor, and every alert must be traceable to the measurement and the
-- threshold that produced it.

CREATE TABLE IF NOT EXISTS monitoring_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES medical_organizations(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description text,
  condition text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_monitoring_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES monitoring_programs(id) ON DELETE RESTRICT,
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','cancelled')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A patient can be enrolled in a program only once while the enrollment is live.
CREATE UNIQUE INDEX IF NOT EXISTS uq_monitoring_enrollment_live
  ON patient_monitoring_enrollments(program_id, patient_profile_id)
  WHERE status IN ('active','paused');

CREATE INDEX IF NOT EXISTS idx_monitoring_enrollments_doctor
  ON patient_monitoring_enrollments(doctor_id, status);

CREATE TABLE IF NOT EXISTS medical_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  device_type text NOT NULL
    CHECK (device_type IN ('blood_pressure','pulse','spo2','glucose','weight','temperature','symptom')),
  label text,
  manufacturer text,
  serial_number text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_devices_patient
  ON medical_devices(patient_profile_id, active);

CREATE TABLE IF NOT EXISTS measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES patient_monitoring_enrollments(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES medical_devices(id) ON DELETE SET NULL,
  metric text NOT NULL
    CHECK (metric IN ('systolic','diastolic','pulse','spo2','glucose','weight','temperature','symptom')),
  value numeric(10,2) NOT NULL,
  unit text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','device','import')),
  recorded_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_measurements_enrollment
  ON measurements(enrollment_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS measurement_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES monitoring_programs(id) ON DELETE RESTRICT,
  metric text NOT NULL
    CHECK (metric IN ('systolic','diastolic','pulse','spo2','glucose','weight','temperature','symptom')),
  min_value numeric(10,2),
  max_value numeric(10,2),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_value IS NOT NULL OR max_value IS NOT NULL),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value < max_value)
);

CREATE TABLE IF NOT EXISTS clinical_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES patient_monitoring_enrollments(id) ON DELETE RESTRICT,
  measurement_id uuid REFERENCES measurements(id) ON DELETE SET NULL,
  threshold_id uuid REFERENCES measurement_thresholds(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text
);

CREATE INDEX IF NOT EXISTS idx_clinical_alerts_open
  ON clinical_alerts(status, created_at DESC)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS monitoring_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES patient_monitoring_enrollments(id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  period_start timestamptz,
  period_end timestamptz,
  summary text NOT NULL CHECK (length(summary) BETWEEN 3 AND 4000),
  action text CHECK (action IN ('continue','adjust_thresholds','schedule_visit','close')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_reviews_enrollment
  ON monitoring_reviews(enrollment_id, created_at DESC);

COMMIT;
