# Stage 17 — retention

Status: source-complete, runtime-unverified (no Docker/PostgreSQL on this workstation).
No retention period is invented by the platform and no destructive job is enabled by default.

## Principle

Deletion of medical data is a legal action, not a maintenance task. The platform stores
retention policies, enforces the configured period, journals every removal and refuses to act
on classes that have no approved disposal procedure. An empty database with no policies means
**nothing is deleted** — that is the intended default.

## Schema (migration `031_retention_policies.sql`)

- `retention_policies` — one row per data class: `retention_days`, `action` (`delete` or
  `soft_delete`), `legal_basis`, `active`. A database CHECK rejects an active policy without a
  period and a legal basis of at least 10 characters, so a half-configured policy cannot exist.
- `retention_runs` — one row per preview/execution with mode, status, cutoff, scanned and
  affected counters. A unique partial index allows only one running execution per data class.
- `retention_deletion_log` — one row per removed/soft-deleted object: run, policy, class, object
  type and id, action and cutoff. Append-only; it is the evidence trail for the deletion.

No policies are seeded. The six classes from the roadmap exist, but their periods and legal
bases must be supplied by the organization.

## Executors (what can actually run)

| Data class | Automatic execution | What happens |
|---|---|---|
| `consultation_materials` | yes | rows older than the cutoff are deleted and logged |
| `medical_documents` | yes, soft delete only | `status='deleted'`; storage object and version history stay until a storage-aware purge is approved |
| `audit_logs` | no | integrity-protected evidence; requires a documented legal procedure outside the platform |
| `security_logs` | no | incident-investigation evidence; disposal follows the incident procedure |
| `payment_records` | no | accounting/fiscal documents; defined with the accountant and the KKT operator |
| `consent_records` | no | the legal basis for processing; cannot be removed by a job |

A class without an executor keeps its policy row for visibility but the API answers `409` with
the reason instead of pretending to delete something.

## API (admin only)

- `GET /v1/admin/retention/policies` — all classes with policy or `null`, plus whether automatic
  execution exists and why not;
- `PUT /v1/admin/retention/policies/:dataClass` — configure period, action, legal basis, active;
- `POST /v1/admin/retention/policies/:dataClass/preview` — cutoff and number of eligible rows,
  read-only;
- `POST /v1/admin/retention/policies/:dataClass/run` — journaled execution;
- `GET /v1/admin/retention/runs` — recent runs.

Every policy change and every execution is also written to `audit_events`.

## Worker

`RetentionWorker` is **disabled by default** (`RETENTION_WORKER_ENABLED=false`) and only runs
classes that already have an active policy with a legal basis and an executor. Each run is
bounded by `RETENTION_BATCH_SIZE` × `RETENTION_MAX_BATCHES`, so a large backlog is processed
across several runs instead of one unbounded transaction.

## Deliberate gaps

- No admin UI yet: configuration is available through the admin API; the UI is a follow-up.
- No storage-object purge: document retention is a soft delete until the MinIO deletion
  procedure (including version history and REMD references) is approved.
- No legal-hold / litigation-hold concept yet; a hold would have to freeze a policy.
- No export/anonymization of clinical text.

## Verification

- API typecheck: PASS
- production build: PASS
- infrastructure validation: PASS
- migration `031` syntax: parsed successfully
- API boot with a stub environment: PASS

Not verified: execution of `031` on PostgreSQL and any destructive run against real data.
