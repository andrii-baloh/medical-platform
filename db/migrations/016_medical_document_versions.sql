BEGIN;

CREATE TABLE IF NOT EXISTS medical_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES medical_documents(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  storage_key text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256_hex char(64) NOT NULL,
  category text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no),
  UNIQUE (document_id, sha256_hex)
);
CREATE INDEX IF NOT EXISTS idx_medical_document_versions_document ON medical_document_versions(document_id, version_no DESC);

CREATE TABLE IF NOT EXISTS medical_document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid NOT NULL REFERENCES medical_document_versions(id) ON DELETE RESTRICT,
  certificate_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text NOT NULL,
  signing_time timestamptz NOT NULL,
  document_hash char(64) NOT NULL,
  signature_status text NOT NULL CHECK (signature_status IN ('valid','invalid','pending_verification','revoked')),
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_document_signatures_version ON medical_document_signatures(document_version_id, signing_time DESC);

CREATE TABLE IF NOT EXISTS medical_document_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid NOT NULL REFERENCES medical_document_versions(id) ON DELETE RESTRICT,
  registry text NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','submitted','registered','failed')),
  registration_date timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_version_id, registry)
);

CREATE TABLE IF NOT EXISTS medical_document_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES medical_documents(id) ON DELETE RESTRICT,
  document_version_id uuid REFERENCES medical_document_versions(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('view','download','grant','revoke','version_list')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_medical_document_access_document ON medical_document_access_logs(document_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_document_access_actor ON medical_document_access_logs(actor_user_id, occurred_at DESC);

ALTER TABLE medical_documents ADD COLUMN IF NOT EXISTS current_version_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='medical_documents_current_version_id_fkey' AND conrelid='medical_documents'::regclass
  ) THEN
    ALTER TABLE medical_documents
      ADD CONSTRAINT medical_documents_current_version_id_fkey
      FOREIGN KEY (current_version_id) REFERENCES medical_document_versions(id) ON DELETE RESTRICT;
  END IF;
END $$;

INSERT INTO medical_document_versions(document_id,version_no,storage_key,original_name,mime_type,size_bytes,sha256_hex,category,created_by_user_id,created_at)
SELECT d.id,1,d.storage_key,d.original_name,d.mime_type,d.size_bytes,d.sha256_hex,d.category,d.uploaded_by_user_id,d.created_at
FROM medical_documents d
WHERE d.sha256_hex IS NOT NULL AND d.status='active'
ON CONFLICT (document_id,version_no) DO NOTHING;

UPDATE medical_documents d
SET current_version_id=v.id
FROM medical_document_versions v
WHERE v.document_id=d.id AND v.version_no=(SELECT max(v2.version_no) FROM medical_document_versions v2 WHERE v2.document_id=d.id)
  AND d.current_version_id IS NULL;

CREATE OR REPLACE FUNCTION prevent_medical_document_version_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Medical document versions are immutable; create a new version instead';
END;
$$;

DROP TRIGGER IF EXISTS medical_document_versions_immutable ON medical_document_versions;
CREATE TRIGGER medical_document_versions_immutable
BEFORE UPDATE OR DELETE ON medical_document_versions
FOR EACH ROW EXECUTE FUNCTION prevent_medical_document_version_mutation();

COMMIT;
