BEGIN;

ALTER TABLE medical_documents
  ADD COLUMN IF NOT EXISTS detected_mime_type text,
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending','clean','infected','error')),
  ADD COLUMN IF NOT EXISTS scan_provider text,
  ADD COLUMN IF NOT EXISTS scan_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_error_code text;

CREATE TABLE IF NOT EXISTS document_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES medical_documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  claimed_by text,
  claim_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error_code text
);

CREATE INDEX IF NOT EXISTS idx_document_scan_jobs_claimable
  ON document_scan_jobs(created_at)
  WHERE status IN ('pending','failed');

CREATE INDEX IF NOT EXISTS idx_medical_documents_scan_status
  ON medical_documents(scan_status, created_at DESC)
  WHERE status <> 'deleted';

-- Existing files predate the scanner. Do not silently declare them clean.
-- They become unavailable until the scan worker processes them.
UPDATE medical_documents
SET status='quarantined', scan_status='pending', scan_provider=NULL, scan_completed_at=NULL
WHERE status='active' AND scan_status='pending';

INSERT INTO document_scan_jobs(document_id,status)
SELECT id,'pending' FROM medical_documents
WHERE status='quarantined' AND scan_status='pending'
ON CONFLICT (document_id) DO NOTHING;

COMMIT;
