BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_subject text NOT NULL UNIQUE,
  email citext,
  full_name text,
  locale text NOT NULL DEFAULT 'ru',
  timezone text NOT NULL DEFAULT 'UTC',
  country_code char(2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('patient','doctor','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  birth_date date,
  sex text CHECK (sex IS NULL OR sex IN ('female','male','other','unspecified')),
  relation_to_owner text NOT NULL DEFAULT 'self',
  legal_representative_name text,
  country_code char(2),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_profiles_owner ON patient_profiles(owner_user_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ru text NOT NULL,
  name_en text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_user_id uuid UNIQUE REFERENCES app_users(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  full_name text NOT NULL,
  about text,
  experience_years integer NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  languages text[] NOT NULL DEFAULT ARRAY['ru']::text[],
  patient_groups text[] NOT NULL DEFAULT ARRAY['adult']::text[],
  rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  price_minor integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  country_code char(2),
  initials text,
  verified boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctors_public ON doctor_profiles(published, verified);

CREATE TABLE IF NOT EXISTS doctor_specialties (
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  specialty_id uuid NOT NULL REFERENCES specialties(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (doctor_id, specialty_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_primary_specialty ON doctor_specialties(doctor_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS appointment_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked','blocked')),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (doctor_id, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_slots_doctor_time ON appointment_slots(doctor_id, starts_at) WHERE status='available';

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES appointment_slots(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'confirmed','patient_checked_in','in_progress','completed',
    'cancelled_by_patient','cancelled_by_doctor','no_show'
  )),
  reason text,
  patient_timezone text NOT NULL,
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_active_appointment ON appointments(slot_id)
  WHERE status IN ('confirmed','patient_checked_in','in_progress','completed');
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  started_at timestamptz,
  ended_at timestamptz,
  complaints text,
  anamnesis text,
  assessment text,
  recommendations text,
  signed_at timestamptz,
  signed_by_user_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS medical_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  uploaded_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256_hex text,
  category text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','active','deleted','quarantined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON medical_documents(patient_profile_id, created_at DESC) WHERE status='active';

CREATE TABLE IF NOT EXISTS document_grants (
  document_id uuid NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  granted_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (document_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS consent_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_type text NOT NULL,
  version text NOT NULL,
  locale text NOT NULL DEFAULT 'ru',
  content_sha256 text NOT NULL,
  published_at timestamptz NOT NULL,
  retired_at timestamptz,
  UNIQUE (consent_type, version, locale)
);

CREATE TABLE IF NOT EXISTS consent_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_document_id uuid NOT NULL REFERENCES consent_documents(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  patient_profile_id uuid REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (consent_document_id, user_id, patient_profile_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_id text,
  status text NOT NULL CHECK (status IN ('created','authorized','paid','failed','refunded','partially_refunded')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments(appointment_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  actor_subject text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','error')),
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;

INSERT INTO specialties(id, code, name_ru, name_en) VALUES
  ('11111111-1111-1111-1111-111111111111','therapy','Терапевт','General practitioner'),
  ('22222222-2222-2222-2222-222222222222','pediatrics','Педиатр','Pediatrician'),
  ('33333333-3333-3333-3333-333333333333','neurology','Невролог','Neurologist'),
  ('44444444-4444-4444-4444-444444444444','psychology','Психолог','Psychologist')
ON CONFLICT (code) DO NOTHING;

INSERT INTO doctor_profiles(
  id,slug,full_name,about,experience_years,languages,patient_groups,rating,review_count,price_minor,currency,initials,verified,published
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','anna-volkova','Анна Волкова','Консультации взрослых пациентов, профилактика и разбор результатов обследований.',12,ARRAY['ru','en'],ARRAY['adult'],4.90,128,3500,'USD','АВ',true,true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','marina-orlova','Марина Орлова','Педиатрические онлайн-консультации и сопровождение родителей.',10,ARRAY['ru'],ARRAY['child'],4.95,96,3200,'USD','МО',true,true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','alexey-smirnov','Алексей Смирнов','Неврологические консультации, головные боли и вопросы по обследованиям.',15,ARRAY['ru','en'],ARRAY['adult'],4.88,173,4200,'USD','АС',true,true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','elena-kuznetsova','Елена Кузнецова','Психологические консультации для взрослых.',9,ARRAY['ru'],ARRAY['adult'],4.92,84,3000,'USD','ЕК',true,true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO doctor_specialties(doctor_id,specialty_id,is_primary) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111',true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','22222222-2222-2222-2222-222222222222',true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','33333333-3333-3333-3333-333333333333',true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','44444444-4444-4444-4444-444444444444',true)
ON CONFLICT DO NOTHING;

-- Development seed: future slots for demo doctors. Production schedule generation is done by the API scheduler.
INSERT INTO appointment_slots(doctor_id,starts_at,ends_at,status,price_minor,currency)
SELECT d.id, s, s + interval '30 minutes', 'available', d.price_minor, d.currency
FROM doctor_profiles d
CROSS JOIN LATERAL generate_series(
  date_trunc('day', now()) + interval '1 day' + interval '09 hours',
  date_trunc('day', now()) + interval '14 days' + interval '09 hours',
  interval '1 day'
) AS days(day_start)
CROSS JOIN LATERAL generate_series(days.day_start, days.day_start + interval '7 hours', interval '90 minutes') AS times(s)
WHERE d.slug IN ('anna-volkova','marina-orlova','alexey-smirnov','elena-kuznetsova')
ON CONFLICT (doctor_id, starts_at) DO NOTHING;

COMMIT;
