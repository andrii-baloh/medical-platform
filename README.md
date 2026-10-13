# MediCare platform 0.13

Provider-neutral technical foundation being developed as a commercial telemedicine platform for the Russian Federation.

## Architecture

- Web: Next.js 15 / React 19
- API: NestJS 11
- Identity: OIDC/OAuth2; local development uses Keycloak
- Database: PostgreSQL 17
- Medical files: private S3-compatible storage; local development uses MinIO
- Video: LiveKit behind a provider adapter
- Document scanning: quarantine workflow with ClamAV support
- Authorization: API-side role + relationship + ownership checks
- Audit: append-only audit events and appointment state history

## Implemented flows

The recovered 0.13 tree contains patient/family profiles, doctor catalog and booking, doctor workspace and consultation lifecycle, immutable signed clinical versions, protected document upload/download/grants, video consultation rooms, notifications/outbox, development payments, admin/support surfaces, favorites and appointment ratings.

Roadmap work after recovery adds a separate medical encounter, patient medical-record aggregation, medical conclusions, immutable medical-document versions, signature abstraction, versioned patient consents, medical-organization data, doctor regulatory credentials, legal representatives, ESIA identity-linking architecture, a dedicated EGISZ integration-job boundary, the REMD registration workflow and the paid-medical-service contract layer.

Stage 13 adds organization-owned service catalogs and offers, immutable versioned contract text, patient contract acceptance evidence and immutable commercial snapshots. Doctor slots may be linked to a configured service offer; the patient sees the organization, license, service, doctor, exact price, conditions, refund rules and service procedure before accepting the contract. The existing payment API refuses to create a payment session until the appointment has a matching accepted contract, so the frontend cannot bypass the legal pre-payment gate.

Database migrations are in `db/migrations` and currently run from `001_initial.sql` through `025_paid_medical_services.sql`. Existing applied migrations must never be edited; add a new migration instead.

## EGISZ / REMD boundary

The integration layer deliberately does not fake a production EGISZ connection. Real registry/REMD transport must be supplied through the adapter boundary after the selected integration contract, test environment and credentials/certificates are known.

REMD registration uses the existing `medical_document_registrations` table. A medical-document version can enter the REMD queue only after the local readiness gates pass: immutable SHA-256, active/clean document, valid qualified clinician signature, verified doctor regulatory profile and an active medical organization. The generic EGISZ job endpoint cannot bypass this REMD workflow. Queue, retry and provider-result state transitions are synchronized with the registration record without storing clinical text in integration errors or the admin UI.

## Local development

Requirements: Node.js 22+ and Docker Desktop with a working WSL2 backend on Windows.

```powershell
copy .env.example .env
npm install
npm run typecheck
npm run build
powershell -ExecutionPolicy Bypass -File scripts/dev-up.ps1
```

The complete stack is defined by root `docker-compose.yml` + `docker-compose.override.yml`. The earlier infrastructure-only entry point remains available as `infra/docker-compose.dev.yml`.

Development endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Keycloak: `http://localhost:8080`
- MinIO: `http://localhost:9000` / console `http://localhost:9001`
- LiveKit: `ws://localhost:7880`

## Validation

```powershell
node scripts/check-infra.cjs
npm run typecheck
npm run build
docker compose --env-file .env.example config --quiet
```

The migration runner records SHA-256 checksums in `schema_migrations`.

## Security boundary

The browser calls the Next.js `/api/backend/*` BFF. The BFF forwards the authenticated OIDC access token to NestJS. Database and S3 credentials do not reach browser code. Patient data access is constrained by ownership/appointment relationships and doctor verification.

Local credentials and secrets in `.env.example` / Keycloak realm are development fixtures only. Do not use real patient data in the local stack.

## Recovery note

This repository was recovered on 2026-10-09 after the original working folder was deleted. Application source was reconstructed from Docker build layers and verified with successful TypeScript typecheck and production builds. Infrastructure files that were not present in image layers were reconstructed from the surviving AI Supervisor engineering log and the accepted CX-001 requirements. See `RECOVERY_NOTES.md` for provenance.
