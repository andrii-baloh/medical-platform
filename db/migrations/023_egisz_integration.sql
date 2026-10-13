BEGIN;

CREATE TABLE integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'egisz' CHECK (provider IN ('egisz')),
  adapter_kind text NOT NULL CHECK (adapter_kind IN ('organization_registry','doctor_registry','remd','patient')),
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (target_type IN ('medical_organization','doctor','medical_document_version','patient')),
  target_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','succeeded','failed','cancelled')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,idempotency_key)
);

CREATE INDEX idx_integration_jobs_queue
  ON integration_jobs(provider,status,available_at,priority,created_at)
  WHERE status='queued';
CREATE INDEX idx_integration_jobs_target
  ON integration_jobs(target_type,target_id,created_at DESC);

CREATE TABLE integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES integration_jobs(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('queued','started','succeeded','failed','retry_scheduled','cancelled')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_integration_events_job ON integration_events(job_id,occurred_at,id);

CREATE TABLE integration_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES integration_jobs(id) ON DELETE RESTRICT,
  attempt_no integer NOT NULL CHECK (attempt_no >= 1),
  error_code text NOT NULL CHECK (length(error_code) BETWEEN 1 AND 120),
  sanitized_message text NOT NULL CHECK (length(sanitized_message) BETWEEN 1 AND 1000),
  retriable boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,attempt_no)
);
CREATE INDEX idx_integration_errors_job ON integration_errors(job_id,occurred_at DESC);

CREATE TABLE integration_retries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES integration_jobs(id) ON DELETE RESTRICT,
  attempt_no integer NOT NULL CHECK (attempt_no >= 1),
  scheduled_at timestamptz NOT NULL,
  reason_code text NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','claimed','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,attempt_no)
);
CREATE INDEX idx_integration_retries_due ON integration_retries(status,scheduled_at) WHERE status='scheduled';

COMMIT;
