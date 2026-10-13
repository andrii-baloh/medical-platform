BEGIN;
CREATE TABLE IF NOT EXISTS consent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consent_type text NOT NULL UNIQUE,
  display_name text NOT NULL, mandatory boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS consent_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES consent_templates(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK(version_no>0), locale text NOT NULL DEFAULT 'ru', content_text text,
  content_sha256 char(64) NOT NULL, published_at timestamptz NOT NULL, retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(template_id,version_no,locale)
);
CREATE INDEX IF NOT EXISTS idx_consent_template_versions_active ON consent_template_versions(template_id,locale,published_at DESC) WHERE retired_at IS NULL;
CREATE TABLE IF NOT EXISTS patient_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT, template_id uuid NOT NULL REFERENCES consent_templates(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('signed','revoked')), current_signed_consent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(patient_profile_id,user_id,template_id)
);
CREATE TABLE IF NOT EXISTS signed_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_consent_id uuid NOT NULL REFERENCES patient_consents(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES consent_template_versions(id) ON DELETE RESTRICT,
  content_sha256 char(64) NOT NULL, content_text text, signed_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  signed_at timestamptz NOT NULL DEFAULT now(), authentication_method text NOT NULL,
  signature text, evidence jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(patient_consent_id,template_version_id)
);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='patient_consents_current_signed_consent_id_fkey') THEN
ALTER TABLE patient_consents ADD CONSTRAINT patient_consents_current_signed_consent_id_fkey FOREIGN KEY(current_signed_consent_id) REFERENCES signed_consents(id) ON DELETE RESTRICT; END IF; END $$;
CREATE TABLE IF NOT EXISTS consent_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_consent_id uuid NOT NULL REFERENCES patient_consents(id) ON DELETE RESTRICT,
  signed_consent_id uuid NOT NULL REFERENCES signed_consents(id) ON DELETE RESTRICT,
  revoked_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT, revoked_at timestamptz NOT NULL DEFAULT now(),
  reason text, evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_profile_id,updated_at DESC);
CREATE OR REPLACE FUNCTION prevent_signed_consent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Signed consents are immutable'; END; $$;
DROP TRIGGER IF EXISTS signed_consents_immutable ON signed_consents;
CREATE TRIGGER signed_consents_immutable BEFORE UPDATE OR DELETE ON signed_consents FOR EACH ROW EXECUTE FUNCTION prevent_signed_consent_mutation();
INSERT INTO consent_templates(consent_type,display_name)
SELECT DISTINCT consent_type,consent_type FROM consent_documents ON CONFLICT(consent_type) DO NOTHING;
WITH ranked AS (SELECT cd.*,ct.id template_id,row_number() over(partition by cd.consent_type,cd.locale order by cd.published_at,cd.id) version_no FROM consent_documents cd JOIN consent_templates ct ON ct.consent_type=cd.consent_type)
INSERT INTO consent_template_versions(template_id,version_no,locale,content_sha256,published_at,retired_at)
SELECT template_id,version_no,locale,content_sha256,published_at,retired_at FROM ranked ON CONFLICT DO NOTHING;
COMMIT;
