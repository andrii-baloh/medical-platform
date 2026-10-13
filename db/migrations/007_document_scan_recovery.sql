BEGIN;

CREATE INDEX IF NOT EXISTS idx_document_scan_jobs_processing_expiry
  ON document_scan_jobs(claim_expires_at)
  WHERE status='processing';

COMMIT;
