# Operational baseline

This runbook is an engineering baseline, not a claim of production readiness or regulatory compliance.

## Health checks

- `GET /health/live` checks that the API process is alive. It does not depend on PostgreSQL.
- `GET /health/ready` verifies database readiness and should be used by deployment readiness checks.
- A failing readiness check should remove an instance from traffic; it should not automatically destroy data or restart stateful services.

## Database migrations

Run migrations from one controlled deployment step:

```text
npm --workspace @medicare/api run migrate
```

Applied migration checksums are recorded. Never edit an already-applied migration; add a new migration.

## PostgreSQL backup

Backups use PostgreSQL custom format. Credentials are supplied only through the environment.

```powershell
$env:DATABASE_URL = "postgresql://..."
.\ops\backup\backup-postgres.ps1 -OutputDirectory D:\secure-backups
.\ops\backup\verify-postgres-backup.ps1 -BackupPath D:\secure-backups\medicare-YYYYMMDD-HHMMSS.dump
```

Do not store database URLs, passwords or backup archives in Git. Encrypt backup storage and apply access controls appropriate to the launch country.

## Restore drill

Restore only into an explicitly selected target database. The script intentionally uses `RESTORE_DATABASE_URL` rather than `DATABASE_URL` and requires a destructive confirmation switch.

```powershell
$env:RESTORE_DATABASE_URL = "postgresql://...restore-target..."
.\ops\backup\restore-postgres.ps1 -BackupPath D:\secure-backups\medicare-YYYYMMDD-HHMMSS.dump -ConfirmDestructiveRestore
```

After restore: run migrations, verify `/health/ready`, validate critical application flows and record the drill result. Archive readability is not a substitute for a real restore test.

## Secret rotation

Rotate OIDC client secrets, payment webhook secrets, LiveKit keys, S3 credentials and application secrets through the deployment secret manager. Never log old/new secret values. Where supported, overlap old and new credentials briefly to allow zero-downtime rotation, then revoke the old credential.

## ClamAV

Monitor `clamd` availability, signature age/update failures, scan latency, queue depth and scan errors. A file must remain unavailable while quarantined or when scanning fails. Never bypass quarantine merely to reduce queue depth.

## LiveKit

Monitor signaling/RTC availability, room creation failures, join-token issuance errors, TURN/ICE connectivity, participant disconnect rates and regional capacity. Do not record calls by default.

## Payments and outbound notifications

Monitor provider webhook verification failures, dedupe/reconciliation errors, refund failures, payout/settlement mismatches, email delivery failures and retry queue depth. Provider dashboards are operational evidence, not the source of truth for clinical records.

## Incident handling

Operational tickets, logs, alerts and chat messages must not contain clinical free text, uploaded document contents, access tokens, passwords or unnecessary patient identifiers. Use internal resource IDs and request IDs for correlation. Access to production data must be role-restricted and auditable.

## Backup retention and deletion

Retention periods must be set per launch country and contract. Do not hard-code a universal medical-data retention period. Deletion workflows must account for database rows, object storage, backups, audit/legal holds and provider-side data.
