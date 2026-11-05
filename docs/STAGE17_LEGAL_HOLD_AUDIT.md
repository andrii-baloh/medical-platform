# Stage 17 — legal hold (class-wide) runtime validation

Test date: 2026-11-05. Scope: isolated PostgreSQL 17 (`medicare_check`, container `medicare-deepseek-stagecheck`). All test documents and materials were synthetic, and the SQL test ran inside a transaction that ended in `ROLLBACK`.

## Implemented
- Migration `035_retention_legal_holds.sql` — legal-hold registry with immutable class/reason/creation evidence; one active hold per data class, reason and admin actor mandatory, documented release.
- Active hold blocks hard deletion of `consultation_materials` and soft deletion (`status='deleted'`) of `medical_documents`, **at the database layer**, including direct SQL and worker requests.
- Per-class policy row locks serialize legal-hold insert/release with each deletion trigger. A registered hold takes effect at commit; any deletion transaction that precedes the hold's policy lock completes before registration can commit.
- `GET /v1/admin/retention/legal-holds`, `POST /v1/admin/retention/legal-holds`, `POST /v1/admin/retention/legal-holds/:id/release` — admin-only (OIDC role plus local `user_roles`) with audit records.
- Retention executor returns a clear conflict if a hold is active, and the database trigger checks again during mutation.

## Verified
- Migration `035` applied via the migration runner on isolated PostgreSQL 17.
- `scripts/test-stage17-legal-holds.sql`: PASS. A synthetic material DELETE and a synthetic document soft-delete both fail under a hold; hold record DELETE is rejected; after release, both operations succeed. The transaction is then rolled back.
- TypeScript and existing API tests: PASS.

## Remaining blockers — NOT production ready
- Class-wide legal hold is available, but there is no per-object/per-case hold interface or approval workflow.
- Orphaned `retention_runs.status='running'` recovery remains unimplemented. Do not enable unattended retention workers.
- Storage-aware purge, backup retention, regulatory retention-period approval, legal review, and an independent restore test are outstanding.
- Class-wide holds protect only currently implemented deletion executors. They do not implement an external object store or backup deletion policy.
- Only an authorized DBA can modify triggers directly; operational database privilege separation and audited DBA access must be reviewed before production.

Do **not** activate live automatic deletion or use real patient records until the outstanding controls have been independently validated.
