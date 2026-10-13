BEGIN;
CREATE TABLE IF NOT EXISTS medical_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_name text NOT NULL, short_name text NOT NULL,
 inn text NOT NULL UNIQUE CHECK(inn ~ '^[0-9]{10}([0-9]{2})?$'), ogrn text NOT NULL UNIQUE CHECK(ogrn ~ '^[0-9]{13}([0-9]{2})?$'),
 address text NOT NULL, contacts jsonb NOT NULL DEFAULT '{}'::jsonb, website text,
 license_number text NOT NULL, license_date date NOT NULL, licensing_authority text NOT NULL,
 license_activities jsonb NOT NULL DEFAULT '[]'::jsonb, egisz_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
 frmo_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb, operator_information jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS doctor_organization_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES medical_organizations(id) ON DELETE RESTRICT, employment_role text,
 is_primary boolean NOT NULL DEFAULT false, starts_at date, ends_at date, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(doctor_id,organization_id), CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>=starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_primary_organization ON doctor_organization_memberships(doctor_id) WHERE is_primary=true AND active=true;
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON doctor_organization_memberships(organization_id,active);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='medical_encounters_organization_id_fkey') THEN ALTER TABLE medical_encounters ADD CONSTRAINT medical_encounters_organization_id_fkey FOREIGN KEY(organization_id) REFERENCES medical_organizations(id) ON DELETE RESTRICT; END IF; IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='medical_conclusions_organization_id_fkey') THEN ALTER TABLE medical_conclusions ADD CONSTRAINT medical_conclusions_organization_id_fkey FOREIGN KEY(organization_id) REFERENCES medical_organizations(id) ON DELETE RESTRICT; END IF; END $$;
COMMIT;
