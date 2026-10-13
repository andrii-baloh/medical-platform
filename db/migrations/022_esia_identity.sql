BEGIN;
CREATE TABLE IF NOT EXISTS federated_identities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 provider text NOT NULL CHECK(provider IN('esia')),
 provider_subject text NOT NULL,
 status text NOT NULL DEFAULT 'linked' CHECK(status IN('linked','verified','revoked','conflict')),
 linked_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 claims_source text NOT NULL DEFAULT 'keycloak_federation',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(provider,provider_subject)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_federated_user_provider_active ON federated_identities(user_id,provider) WHERE status<>'revoked';
CREATE INDEX IF NOT EXISTS idx_federated_identity_user ON federated_identities(user_id,status);

CREATE TABLE IF NOT EXISTS federated_auth_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
 provider text NOT NULL CHECK(provider IN('esia')),
 provider_subject text NOT NULL,
 session_key text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN('login_success','login_failed','identity_linked','identity_verified','identity_conflict')),
 identity_verified boolean NOT NULL DEFAULT false,
 auth_time timestamptz,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(provider,provider_subject,session_key,event_type)
);
CREATE INDEX IF NOT EXISTS idx_federated_auth_user_time ON federated_auth_events(user_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS patient_identity_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
 federated_identity_id uuid NOT NULL REFERENCES federated_identities(id) ON DELETE RESTRICT,
 status text NOT NULL CHECK(status IN('suggested','verified','rejected','revoked')),
 match_basis text NOT NULL CHECK(match_basis IN('account_owner','manual','registry')),
 verified_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
 verified_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(patient_profile_id,federated_identity_id)
);
CREATE INDEX IF NOT EXISTS idx_patient_identity_match ON patient_identity_matches(patient_profile_id,status);

CREATE OR REPLACE VIEW representative_identity_status AS
SELECT r.id representative_id,r.patient_profile_id,r.representative_user_id,r.status representative_status,
       f.id federated_identity_id,f.provider_subject esia_id,f.status identity_status,f.verified_at identity_verified_at
FROM patient_representatives r
LEFT JOIN federated_identities f ON f.user_id=r.representative_user_id AND f.provider='esia' AND f.status<>'revoked';
COMMIT;
