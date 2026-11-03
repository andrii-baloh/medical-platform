BEGIN;

-- Stage 17: retention policy storage.
--
-- The platform does NOT invent legal retention periods. A policy row starts
-- inactive with no period; an authorized administrator must set the period and
-- the legal basis explicitly. Nothing is deleted until that happens.
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_class text NOT NULL UNIQUE CHECK (data_class IN (
    'consultation_materials','medical_documents','audit_logs','security_logs','payment_records','consent_records'
  )),
  retention_days integer CHECK (retention_days IS NULL OR retention_days >= 1),
  action text NOT NULL DEFAULT 'delete' CHECK (action IN ('delete','soft_delete')),
  legal_basis text,
  active boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- An active policy must carry a period and a legal basis; the database
  -- refuses a half-configured policy instead of trusting application code.
  CHECK (NOT active OR (retention_days IS NOT NULL AND legal_basis IS NOT NULL AND length(legal_basis) >= 10))
);

CREATE TABLE IF NOT EXISTS retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES retention_policies(id) ON DELETE SET NULL,
  data_class text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('dry_run','execute')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  cutoff_at timestamptz,
  scanned integer NOT NULL DEFAULT 0 CHECK (scanned >= 0),
  affected integer NOT NULL DEFAULT 0 CHECK (affected >= 0),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  performed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL
);

-- One running execution per data class, so two workers cannot delete the same
-- class concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_runs_active
  ON retention_runs(data_class)
  WHERE status = 'running' AND mode = 'execute';

CREATE INDEX IF NOT EXISTS idx_retention_runs_class
  ON retention_runs(data_class, started_at DESC);

CREATE TABLE IF NOT EXISTS retention_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES retention_runs(id) ON DELETE RESTRICT,
  policy_id uuid REFERENCES retention_policies(id) ON DELETE SET NULL,
  data_class text NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_deletion_log_run
  ON retention_deletion_log(run_id, performed_at);

COMMIT;
