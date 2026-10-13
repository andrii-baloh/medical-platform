BEGIN;

CREATE TABLE service_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES medical_organizations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code)
);
CREATE INDEX idx_service_catalogs_org_active ON service_catalogs(organization_id,active,name);

CREATE TABLE contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES medical_organizations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 80),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 300),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code)
);

CREATE TABLE contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES contract_templates(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  locale text NOT NULL DEFAULT 'ru' CHECK (length(locale) BETWEEN 2 AND 20),
  content_text text NOT NULL CHECK (length(content_text) > 0),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id,version_no,locale),
  CHECK (retired_at IS NULL OR retired_at >= published_at)
);
CREATE INDEX idx_contract_versions_current
  ON contract_versions(template_id,locale,published_at DESC)
  WHERE retired_at IS NULL;

CREATE TABLE service_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_catalog_id uuid NOT NULL REFERENCES service_catalogs(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES medical_organizations(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  contract_template_id uuid NOT NULL REFERENCES contract_templates(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description text,
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  conditions_text text NOT NULL CHECK (length(conditions_text) > 0),
  refund_policy_text text NOT NULL CHECK (length(refund_policy_text) > 0),
  service_procedure_text text NOT NULL CHECK (length(service_procedure_text) > 0),
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX idx_service_offers_doctor_active
  ON service_offers(doctor_id,active,valid_from,valid_until);
CREATE INDEX idx_service_offers_catalog_active
  ON service_offers(service_catalog_id,active);

ALTER TABLE appointment_slots
  ADD COLUMN IF NOT EXISTS service_offer_id uuid REFERENCES service_offers(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_appointment_slots_service_offer
  ON appointment_slots(service_offer_id) WHERE service_offer_id IS NOT NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS service_offer_id uuid REFERENCES service_offers(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_appointments_service_offer
  ON appointments(service_offer_id) WHERE service_offer_id IS NOT NULL;

CREATE TABLE patient_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  accepted_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  service_offer_id uuid NOT NULL REFERENCES service_offers(id) ON DELETE RESTRICT,
  contract_version_id uuid NOT NULL REFERENCES contract_versions(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES medical_organizations(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','fulfilled','cancelled')),
  contract_content_sha256 char(64) NOT NULL CHECK (contract_content_sha256 ~ '^[0-9a-f]{64}$'),
  commercial_snapshot jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fulfilled_at IS NULL OR fulfilled_at >= accepted_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= accepted_at)
);
CREATE INDEX idx_patient_contracts_patient ON patient_contracts(patient_profile_id,accepted_at DESC);
CREATE INDEX idx_patient_contracts_offer ON patient_contracts(service_offer_id,accepted_at DESC);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_contract_id uuid REFERENCES patient_contracts(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_patient_contract
  ON appointments(patient_contract_id) WHERE patient_contract_id IS NOT NULL;

CREATE TABLE contract_acceptance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_contract_id uuid NOT NULL REFERENCES patient_contracts(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  event_type text NOT NULL DEFAULT 'accepted' CHECK (event_type IN ('accepted')),
  authentication_method text NOT NULL CHECK (length(authentication_method) BETWEEN 1 AND 80),
  contract_content_sha256 char(64) NOT NULL CHECK (contract_content_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_contract_acceptance_contract
  ON contract_acceptance_events(patient_contract_id,occurred_at,id);

CREATE OR REPLACE FUNCTION prevent_contract_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published contract versions are immutable';
END;
$$;
DROP TRIGGER IF EXISTS contract_versions_immutable ON contract_versions;
CREATE TRIGGER contract_versions_immutable
BEFORE UPDATE OR DELETE ON contract_versions
FOR EACH ROW EXECUTE FUNCTION prevent_contract_version_mutation();

CREATE OR REPLACE FUNCTION prevent_contract_acceptance_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Contract acceptance events are immutable';
END;
$$;
DROP TRIGGER IF EXISTS contract_acceptance_events_immutable ON contract_acceptance_events;
CREATE TRIGGER contract_acceptance_events_immutable
BEFORE UPDATE OR DELETE ON contract_acceptance_events
FOR EACH ROW EXECUTE FUNCTION prevent_contract_acceptance_event_mutation();

CREATE OR REPLACE FUNCTION protect_accepted_patient_contract_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('accepted','fulfilled','cancelled') AND (
    NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR
    NEW.patient_profile_id IS DISTINCT FROM OLD.patient_profile_id OR
    NEW.accepted_by_user_id IS DISTINCT FROM OLD.accepted_by_user_id OR
    NEW.service_offer_id IS DISTINCT FROM OLD.service_offer_id OR
    NEW.contract_version_id IS DISTINCT FROM OLD.contract_version_id OR
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR
    NEW.price_minor IS DISTINCT FROM OLD.price_minor OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.contract_content_sha256 IS DISTINCT FROM OLD.contract_content_sha256 OR
    NEW.commercial_snapshot IS DISTINCT FROM OLD.commercial_snapshot OR
    NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
  ) THEN
    RAISE EXCEPTION 'Accepted patient contract legal snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_contract_snapshot_immutable ON patient_contracts;
CREATE TRIGGER patient_contract_snapshot_immutable
BEFORE UPDATE ON patient_contracts
FOR EACH ROW EXECUTE FUNCTION protect_accepted_patient_contract_snapshot();

COMMIT;
