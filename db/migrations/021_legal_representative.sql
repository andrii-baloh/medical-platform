BEGIN;
CREATE TABLE IF NOT EXISTS patient_representatives(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
 representative_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,relation_type text NOT NULL CHECK(relation_type IN('parent','guardian','representative')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','revoked','expired')),valid_from date,valid_until date,
 verified_at timestamptz,verified_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(patient_profile_id,representative_user_id),CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from)
);
CREATE TABLE IF NOT EXISTS representative_authority_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),representative_id uuid NOT NULL REFERENCES patient_representatives(id) ON DELETE RESTRICT,
 medical_document_id uuid REFERENCES medical_documents(id) ON DELETE RESTRICT,document_type text NOT NULL,document_number text,issuer text,issued_at date,valid_until date,
 verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN('pending','verified','rejected','expired')),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(valid_until IS NULL OR issued_at IS NULL OR valid_until>=issued_at)
);
CREATE TABLE IF NOT EXISTS representative_permissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),representative_id uuid NOT NULL REFERENCES patient_representatives(id) ON DELETE RESTRICT,
 scope text NOT NULL CHECK(scope IN('read_record','book_appointments','manage_documents','manage_consents','join_consultation','receive_results')),
 granted_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,granted_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 UNIQUE(representative_id,scope)
);
CREATE INDEX IF NOT EXISTS idx_representatives_user ON patient_representatives(representative_user_id,status);
CREATE INDEX IF NOT EXISTS idx_representatives_patient ON patient_representatives(patient_profile_id,status);
CREATE INDEX IF NOT EXISTS idx_rep_permissions_active ON representative_permissions(representative_id,scope) WHERE revoked_at IS NULL;
COMMIT;
