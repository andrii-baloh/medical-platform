# Architecture — MediCare 0.13

## Components

The application is a Node.js monorepo with a Next.js Web application and a NestJS API. PostgreSQL is the system of record. Identity is provider-neutral OIDC/OAuth2; local development uses Keycloak. Medical files use an S3-compatible private object store; local development uses MinIO. Video is behind an application provider interface with a LiveKit adapter.

## Trust boundaries

The browser talks to the Next.js BFF under `/api/backend/*`. The BFF reads the authenticated NextAuth session, forwards only the OIDC access token and request metadata to NestJS, and never exposes database or S3 credentials to browser code.

The API validates token signature, issuer and audience against OIDC/JWKS configuration. Authorization is enforced server-side using roles plus ownership and appointment relationships; UI visibility is never treated as an authorization boundary.

## Data model

PostgreSQL migrations live in `db/migrations`. Applied migration checksums are persisted in `schema_migrations`. The application uses app users mapped to external identity subjects, patient profiles owned by accounts, verified/published doctor profiles, appointment slots and appointments, protected medical documents/grants, consultation versions, video rooms/events, notifications/outbox, payments/support/admin data and engagement/favorites/reviews.

Signed clinical consultation versions are immutable snapshots. Amendments create a new editable version rather than changing a prior signed version.

## Local infrastructure

Root Compose definitions provide PostgreSQL, Keycloak, MinIO, ClamAV and LiveKit. The override adds API and Web. API startup waits for required infrastructure health and MinIO initialization; Web waits for API readiness.

Named volumes keep local database/object/scanner state across normal `docker compose down` operations.

## Country deployment model

Production deployments should use isolated country cells where legal, operational and data-residency requirements differ. Country-specific identity, payment, storage, video, signing, retention and notification adapters should be configured without weakening the common authorization model.
