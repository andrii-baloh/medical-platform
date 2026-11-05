# Stage 21 — Security Incident Response

## Scope
A server-enforced incident register with admin-only access, validated status transitions, immutable append-only investigation timeline, containment notes, incident classification, investigators, final report, deadlines, and manually recorded regulator notification evidence. This is an operational workflow, **not** an automated incident detector, forensic collection engine, or regulator reporting gateway.

### Interface and API
- UI: `/admin/security-incidents`.
- `GET /v1/admin/security-incidents` (admin, optional status/severity/limit)
- `GET /v1/admin/security-incidents/:id` (admin, includes last 300 timeline events)
- `POST /v1/admin/security-incidents` (admin, register detected incident)
- `PATCH /v1/admin/security-incidents/:id` (admin, controlled updates)
- `POST /v1/admin/security-incidents/:id/notifications` (admin, *record evidence* of manually submitted initial/final notice)

Admin role must be present in both the authenticated OIDC principal and the local `user_roles` table. Other users cannot read or change incidents. No personal clinical data should be entered into incident title, notes or timeline. Keep evidence in a separately access-controlled evidence repository.

### Workflow
`detected → triage → contained → investigating → resolved → closed`; investigating may return to contained, and resolved may reopen to investigating. Final report is mandatory before closing. For a confirmed breach affecting personal-data subject rights, final notification evidence must be present before closure. Closed incidents are read-only.

Incident timeline is inserted in the same database transaction as each state change. Database trigger prohibits UPDATE/DELETE of incident event rows. Database backup/superuser protection and external SIEM retention are separate infrastructure responsibilities.

### Russian personal-data breach notification
For confirmed unlawful or accidental personal-data transfer/provision/distribution/access violating data subject rights, Art. 21(3.1) of Russian Federal Law 152-FZ provides initial notification within **24 hours** of detection and investigation results within **72 hours** of detection. This workflow computes both UTC-based deadlines from `detected_at`, presents overdue indicators, and records reference numbers/time submitted by a human. It **does not send** notifications or establish that submission really occurred. Notification applicability must be determined by the designated legal/security officer. Other reporting requirements, including GosSOPKA/NKTsKI and critical infrastructure, require separate assessment.

Sources (verify current rules before production):
- https://www.consultant.ru/document/cons_doc_LAW_61801/d3fe43a7c415353b17faab255bc0de92bea127da/
- https://www.garant.ru/products/ipo/prime/doc/405945757/

### Deployment
1. Apply `db/migrations/026_security_incidents.sql` on the correct database using the existing migration runner **only if** `schema_migrations` was initialized with all previously applied migrations.
2. Run `npm run typecheck`, `npm run build` and backend tests.
3. Run the isolated Docker stack and test permissions, persistence, timeline immutability, due dates and notification lifecycle. Never run destructive migration commands against the legacy environment.
4. Set up operational alerting, notification procedures, security responsibilities, backups and protected logging before real-world operation.

### Limitations
- No SIEM ingestion, evidence file attachments, automatic detection, externally verified regulator submission, legal approval, or production notification dispatcher.
- Do not use demo credentials or patient data.
- Stages 14–20 were not recovered in the current GitHub baseline and are not represented as complete.
