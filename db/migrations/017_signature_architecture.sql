BEGIN;
ALTER TABLE medical_document_signatures
  ADD COLUMN IF NOT EXISTS signed_by_user_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS signed_by_doctor_id uuid REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS qualification_status text NOT NULL DEFAULT 'unverified' CHECK (qualification_status IN ('qualified','not_qualified','unverified'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_signature_provider
  ON medical_document_signatures(document_version_id, provider)
  WHERE provider IS NOT NULL AND signature_status <> 'revoked';
COMMIT;
