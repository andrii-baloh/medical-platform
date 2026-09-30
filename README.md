# MediCare platform 0.9 — patient, doctor and admin platform with document quarantine pipeline

This repository is the provider-neutral foundation for a multi-country online medical consultation platform. Supabase is not an architectural dependency. The application uses standard interfaces so PostgreSQL, OIDC identity, S3-compatible storage, video and payment providers can be selected per launch country.

## Architecture

- **Web:** Next.js 15 / React 19
- **API:** NestJS 11
- **Identity:** OIDC/OAuth2; local development uses Keycloak
- **Database:** PostgreSQL 17
- **Medical files:** private S3-compatible object storage; local development uses MinIO
- **Document security:** server-side signature/checksum verification, quarantine state and provider-neutral scan worker before files become active
- **Authorization:** API-side role + relationship + ownership checks
- **Audit:** append-only `audit_events` plus appointment state history
- **Clinical records:** mutable draft + immutable signed version snapshots with hash chaining
- **Reliability:** transactional booking, idempotency keys and leased transactional outbox processing
- **Video:** provider-neutral adapter; local development is configured for self-hosted LiveKit
- **Notifications:** in-app notifications derived from domain outbox events with deduplication
- **Payments:** provider-neutral adapter with development-only provider, webhook reconciliation records, refunds model and patient payment UI
- **Admin:** API-enforced admin role with operational dashboard, doctor verification, appointments, payments and audit views without clinical free text
- **Country deployment:** isolated country cells instead of one global medical database

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_RESIDENCY.md` and `docs/DOCTOR_WORKSPACE.md`.

## Implemented patient flow

- public doctor catalog and available slots;
- authenticated patient/family profiles;
- atomic appointment booking and patient cancellation;
- private document upload/download through signed S3 URLs;
- uploaded PDF/JPEG/PNG/WebP files are server-verified by magic bytes and authoritative SHA-256, quarantined, then released only after scan verdict;
- explicit grant/revoke of one active document to one connected doctor;
- patient consultation list and appointment detail UI;
- LiveKit video join through short-lived server-issued tokens;
- read-only access to immutable signed consultation results and version history;
- in-app notifications with unread count and read/read-all actions;
- payment-session creation from booking/consultation UI, payment status display and development-mode payment adapter;
- unified responsive patient UI for home, doctor discovery/profile, booking, consultations, documents, notifications, profile and login;
- desktop navigation plus mobile bottom navigation with consistent patient design system.

## Implemented doctor workspace

Routes under `/doctor` now provide:

- **Today dashboard** with upcoming metrics and today's appointments;
- **working calendar** with concrete slots, booked patients and block/unblock controls;
- **working-hours template** stored separately from bookable slots;
- **patient list** limited to patients who have an appointment relationship with the doctor;
- **patient card** with that doctor's appointment history and only explicitly granted documents;
- **appointment workspace** with reason for visit, patient documents and clinical notes;
- **LiveKit video panel** with camera/microphone controls and server-enforced join window;
- **start / cancel / complete** appointment transitions;
- **clinical conclusion draft** (`complaints`, `anamnesis`, `assessment`, `recommendations`);
- **sign version** operation creating an immutable `consultation_versions` snapshot;
- **SHA-256 hash chain** between signed versions;
- **explicit amendment** operation that starts the next editable version without changing prior signed versions;
- unified responsive doctor UI aligned with the patient design system across dashboard, calendar, patient list/card, consultation workspace and profile.

`consultation_versions` has a PostgreSQL trigger that rejects update/delete operations.

## Implemented payments and admin foundation

- provider-neutral `PaymentProvider` interface;
- development-only payment adapter that never processes card data or moves money;
- payment session records, provider/session identifiers and webhook event deduplication;
- payment status reconciliation into the transactional outbox;
- refund request records with refundable-amount protection;
- patient payment actions on booking success and consultation detail;
- generic payment-status notifications without medical text;
- admin dashboard with aggregate operational metrics;
- doctor verification/publication controls;
- admin appointment and payment tables;
- searchable audit trail;
- admin API authorization requires both verified OIDC `admin` role and persisted `user_roles` membership;
- admin screens intentionally do not expose consultation complaints, anamnesis, assessment or recommendations.

The current payment adapter is for development only. A launch country still requires a real regulated payment provider implementation and provider-specific webhook verification.

## Document quarantine and scanning

Uploaded medical files are no longer activated immediately after S3 upload. The API verifies declared size/content type, inspects file signatures for the allowed formats, computes the authoritative SHA-256 itself, and moves the document to `quarantined`. A leased `document_scan_jobs` worker then obtains a verdict through the provider-neutral `DocumentScannerProvider` interface. Only a `clean` verdict changes the document to `active`; infected/error files remain unavailable for download and sharing.

`DOCUMENT_SCAN_PROVIDER=development-pass` is intentionally a local-development stub. It emits a warning and does **not** perform malware detection. It must be replaced with a real scanner before staging/production use; its existence is not a security or compliance claim.

Migration `006_document_security.sql` also quarantines previously active unscanned files instead of silently labeling them clean.

## Local development

Requirements: Docker, Node.js 22+, npm.

```bash
cp .env.example .env
docker compose -f infra/docker-compose.dev.yml up -d
npm install
npm --workspace @medicare/api run migrate
npm --workspace @medicare/api run dev
npm --workspace @medicare/web run dev
```

Development infrastructure:

- PostgreSQL: `localhost:5432`
- Keycloak: `localhost:8080`
- MinIO S3: `localhost:9000`
- MinIO console: `localhost:9001`
- LiveKit signaling/WebSocket: `localhost:7880`
- LiveKit RTC TCP/UDP: `7881` / `7882`

Local-only demo accounts imported into Keycloak:

```text
Doctor:  doctor@medicare.local / Doctor123!
Patient: patient@medicare.local / Patient123!
```

These credentials are **development fixtures only**. Never reuse them in a shared, staging or production environment.

### Database migrations

```bash
npm --workspace @medicare/api run migrate
```

Applied migration checksums are recorded. Existing applied migrations must never be edited; add a new migration instead.

## Authentication boundary

The browser calls the Next.js `/api/backend/*` BFF route. The BFF forwards the authenticated OIDC access token to NestJS. Database credentials and S3 secret keys never reach browser code.

The API synchronizes trusted `patient`, `doctor` and `admin` roles from the verified OIDC token into `user_roles`, but doctor workspace access additionally requires a verified doctor profile linked to the account.

## Doctor API surface

Authenticated verified doctor:

```text
GET  /v1/doctor/me
GET  /v1/doctor/dashboard
GET  /v1/doctor/appointments
GET  /v1/doctor/appointments/:id
POST /v1/doctor/appointments/:id/start
POST /v1/doctor/appointments/:id/complete
POST /v1/doctor/appointments/:id/cancel

GET  /v1/doctor/patients
GET  /v1/doctor/patients/:id

PUT  /v1/doctor/appointments/:id/consultation
POST /v1/doctor/appointments/:id/consultation/sign
POST /v1/doctor/appointments/:id/consultation/amend
GET  /v1/doctor/appointments/:id/consultation/versions

GET  /v1/doctor/working-hours
PUT  /v1/doctor/working-hours
GET  /v1/doctor/slots
POST /v1/doctor/slots
POST /v1/doctor/slots/:id/block
POST /v1/doctor/slots/:id/unblock
```

## Video, patient results and notifications API

```text
POST /v1/video/appointments/:id/join
POST /v1/video/doctor/appointments/:id/join
POST /v1/video/appointments/:id/events
POST /v1/video/doctor/appointments/:id/close

GET  /v1/appointments/:id
GET  /v1/appointments/:id/result
GET  /v1/appointments/:id/result/versions

GET  /v1/notifications
GET  /v1/notifications/unread-count
POST /v1/notifications/:id/read
POST /v1/notifications/read-all
```

Video access is checked on the backend for ownership/doctor relationship, appointment state and time window. Raw video tokens are never persisted. Patient result endpoints read only immutable signed `consultation_versions`; mutable drafts are never exposed.

## Payments and admin API

```text
POST /v1/payments/appointments/:appointmentId/session
GET  /v1/payments/appointments/:appointmentId
POST /v1/payments/:paymentId/refunds
POST /v1/payments/webhooks/development

GET   /v1/admin/dashboard
GET   /v1/admin/doctors
GET   /v1/admin/doctors/:id
PATCH /v1/admin/doctors/:id
GET   /v1/admin/appointments
GET   /v1/admin/payments
GET   /v1/admin/audit
```

The development webhook endpoint is only for the local development adapter and must not be treated as a production payment integration.

## Quick visual review

Open `doctor-preview.html` directly in a browser. It is a self-contained interactive visual preview and does not connect to the database. The actual Next.js doctor pages use the API endpoints above.

## Not yet production-complete

The repository is an engineering implementation, not a claim of medical/legal compliance. Before real patients are processed in a specific country, the following still need country-specific implementation and validation:

- real-world doctor onboarding evidence, licensing checks and operational verification workflow;
- legally appropriate clinician identity and electronic-signature method;
- production LiveKit deployment/provider selection, credentials, TURN/network validation and operational monitoring;
- real launch-country payment provider, production webhook signature verification, settlement reconciliation and payout operations;
- outbound notification providers and delivery tracking for email/SMS/push;
- malware scanning/quarantine pipeline for uploaded files;
- backup/restore automation and tested disaster recovery;
- KMS/envelope encryption where required;
- observability, alerting, CI/CD and security scanning;
- retention/deletion policy implementation;
- legal telemedicine, consent, data-residency and cross-border rules for each launch country.

Do not put real patient data into the local demo stack.
