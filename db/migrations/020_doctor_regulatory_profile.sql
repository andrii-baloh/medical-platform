BEGIN;
CREATE TABLE IF NOT EXISTS doctor_regulatory_profiles (
 doctor_id uuid PRIMARY KEY REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
 full_legal_name text NOT NULL, qualification text, education jsonb NOT NULL DEFAULT '[]'::jsonb,
 accreditation jsonb NOT NULL DEFAULT '[]'::jsonb, frmr_identifier text UNIQUE,
 egisz_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb, digital_certificate_info jsonb NOT NULL DEFAULT '{}'::jsonb,
 regulatory_status text NOT NULL DEFAULT 'draft' CHECK(regulatory_status IN('draft','verified','suspended','expired')),
 verified_at timestamptz, verified_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS doctor_regulatory_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
 credential_type text NOT NULL CHECK(credential_type IN('education','qualification','accreditation','certificate','other')),
 title text NOT NULL, issuer text, credential_number text, issued_at date, expires_at date,
 document_id uuid REFERENCES medical_documents(id) ON DELETE RESTRICT, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','expired','revoked','superseded')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at IS NULL OR issued_at IS NULL OR expires_at>=issued_at)
);
CREATE INDEX IF NOT EXISTS idx_doctor_credentials_doctor ON doctor_regulatory_credentials(doctor_id,status,credential_type);
INSERT INTO doctor_regulatory_profiles(doctor_id,full_legal_name)
SELECT id,full_name FROM doctor_profiles ON CONFLICT(doctor_id) DO NOTHING;
COMMIT;
