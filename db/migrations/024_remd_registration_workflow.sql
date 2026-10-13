BEGIN;

ALTER TABLE medical_document_registrations
  ADD COLUMN IF NOT EXISTS integration_job_id uuid REFERENCES integration_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_medical_document_registration_job
  ON medical_document_registrations(integration_job_id)
  WHERE integration_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medical_document_registrations_registry_status
  ON medical_document_registrations(registry,status,updated_at DESC);

COMMIT;
