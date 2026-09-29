# MediCare platform 0.4 — doctor workspace + signed clinical versions

This repository is the provider-neutral foundation for a multi-country online medical consultation platform. Supabase is not an architectural dependency. The application uses standard interfaces so PostgreSQL, OIDC identity, S3-compatible storage, video and payment providers can be selected per launch country.

## Architecture

- **Web:** Next.js 15 / React 19
- **API:** NestJS 11
- **Identity:** OIDC/OAuth2; local development uses Keycloak
- **Database:** PostgreSQL 17
- **Medical files:** private S3-compatible object storage; local development uses MinIO
- **Authorization:** API-side role + relationship + ownership checks
- **Audit:** append-only `audit_events` plus appointment state history
- **Clinical records:** mutable draft + immutable signed version snapshots with hash chaining
- **Reliability:** transactional booking, idempotency keys and transactional outbox
- **Country deployment:** isolated country cells instead of one global medical database

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_RESIDENCY.md` and `docs/DOCTOR_WORKSPACE.md`.

## Implemented patient flow

- public doctor catalog and available slots;
- authenticated patient/family profiles;
- atomic appointment booking and patient cancellation;
- private document upload/download through signed S3 URLs;
- explicit grant/revoke of one document to one connected doctor;
- patient consultation list and profile UI.

## Implemented doctor workspace

Routes under `/doctor` now provide:

- **Today dashboard** with upcoming metrics and today's appointments;
- **working calendar** with concrete slots, booked patients and block/unblock controls;
- **working-hours template** stored separately from bookable slots;
- **patient list** limited to patients who have an appointment relationship with the doctor;
- **patient card** with that doctor's appointment history and only explicitly granted documents;
- **appointment workspace** with reason for visit, patient documents and clinical notes;
- **start / cancel / complete** appointment transitions;
- **clinical conclusion draft** (`complaints`, `anamnesis`, `assessment`, `recommendations`);
- **sign version** operation creating an immutable `consultation_versions` snapshot;
- **SHA-256 hash chain** between signed versions;
- **explicit amendment** operation that starts the next editable version without changing prior signed versions.

`consultation_versions` has a PostgreSQL trigger that rejects update/delete operations.

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

## Quick visual review

Open `doctor-preview.html` directly in a browser. It is a self-contained interactive visual preview and does not connect to the database. The actual Next.js doctor pages use the API endpoints above.

## Not yet production-complete

The repository is an engineering implementation, not a claim of medical/legal compliance. Before real patients are processed in a specific country, the following still need country-specific implementation and validation:

- admin verification/onboarding for real medical professionals;
- legally appropriate clinician identity and electronic-signature method;
- video provider adapter;
- payment provider + webhook reconciliation;
- notification outbox worker (email/SMS/push);
- malware scanning/quarantine pipeline for uploaded files;
- backup/restore automation and tested disaster recovery;
- KMS/envelope encryption where required;
- observability, alerting, CI/CD and security scanning;
- retention/deletion policy implementation;
- legal telemedicine, consent, data-residency and cross-border rules for each launch country.

Do not put real patient data into the local demo stack.
