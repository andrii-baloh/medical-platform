BEGIN;

CREATE TABLE IF NOT EXISTS favorite_doctors (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, doctor_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_doctors_user_created
  ON favorite_doctors(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS doctor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_reviews_doctor
  ON doctor_reviews(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_reviews_user
  ON doctor_reviews(user_id, created_at DESC);

COMMIT;
