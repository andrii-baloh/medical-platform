# Stage 17 — retention

Status: PostgreSQL migration and class-wide legal-hold safety tested on Orest PC; unattended retention execution remains blocked pending independent review. See `STAGE17_LEGAL_HOLD_AUDIT.md`.
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
- `GET /v1/admin/retention/runs` — recent runs;
- `GET /v1/admin/retention/legal-holds` — legal-hold register;
- `POST /v1/admin/retention/legal-holds` — establish a class-wide hold with a reason;
- `POST /v1/admin/retention/legal-holds/:id/release` — release a hold with a documented reason.

Every policy change and every execution is also written to `audit_events`.

## Worker

`RetentionWorker` is **disabled by default** (`RETENTION_WORKER_ENABLED=false`) and only runs
classes that already have an active policy with a legal basis and an executor. Each run is
bounded by `RETENTION_BATCH_SIZE` × `RETENTION_MAX_BATCHES`, so a large backlog is processed
across several runs instead of one unbounded transaction.

## Safety invariants

- The journal stores the effective policy snapshot for every deletion (`cutoffAt`, `retentionDays`,
  `policyUpdatedAt`, `legalBasis`) plus the immutable `retention_runs` row (`policy_id`,
  `cutoff_at`), so a later policy edit cannot change the history of what was deleted.
- `retention_deletion_log.object_id` lists only rows the mutation **actually** changed
  (`RETURNING id`), not rows merely selected.
- The executed operation is a property of the data class: `consultation_materials` is hard delete,
  `medical_documents` is soft delete, and the API rejects a policy that claims otherwise. The
  journal therefore cannot report a soft delete for removed rows.
- Deleting a consultation material removes only that row: `document_id`, `encounter_id`,
  `appointment_id` are `ON DELETE RESTRICT` children, document versions live in
  `medical_document_versions`, and `audit_events.resource_id` is a plain `text` reference with no
  cascade — no document, version, encounter or audit row is touched.
- One running execution per data class is enforced by a partial unique index, so two workers or an
  admin plus a worker cannot process the same class concurrently.

## Production blockers (must be closed before real data)

1. **Legal hold review.** Migration `035` implements class-wide legal holds and database-level guards for the two existing deletion executors. The SQL safety test passes. Per-case holds, operational approvals, DBA privilege restrictions and independent review remain outstanding. See `STAGE17_LEGAL_HOLD_AUDIT.md`.
2. Storage-aware document purge: today document retention is a soft delete only; MinIO objects and
   version history remain.
3. Abandoned runs: a crash leaves `retention_runs.status='running'`, which blocks that class until
   an operator marks the run failed. A lease/recovery mechanism is required before unattended use.
4. Customer-approved retention periods and legal bases per data class; the platform seeds none.

## Deliberate gaps

- No admin UI yet: configuration is available through the admin API; the UI is a follow-up.
- No storage-object purge: document retention is a soft delete until the MinIO deletion procedure
  (including version history and REMD references) is approved.
- No export/anonymization of clinical text.

## Verification

- API typecheck: PASS
- production build: PASS
- infrastructure validation: PASS
- migration `031` syntax: parsed successfully
- API boot with a stub environment: PASS

Not verified: execution of `031` on PostgreSQL and any destructive run against real data.
