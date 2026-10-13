# MediCare infrastructure layout

Canonical local infrastructure is defined by the repository-root `docker-compose.yml`.

```text
MedicalPlatform/
├─ docker-compose.yml
├─ .env.example
├─ db/
│  ├─ migrations/
│  │  ├─ 001_initial.sql
│  │  └─ ... 010_patient_engagement.sql
│  └─ dev/
│     └─ 999_dev_doctor_seed.sql
└─ infra/
   ├─ README.md
   ├─ postgres/
   │  └─ init/
   │     └─ 000_create_keycloak_db.sql
   ├─ keycloak/
   │  └─ realm-export.json
   ├─ livekit/
   │  ├─ config.yaml
   │  └─ livekit.yaml        # legacy local config; canonical file is config.yaml
   ├─ minio/
   │  └─ policies/
   │     └─ medical-documents.json
   ├─ clamav/
   │  ├─ clamd.conf
   │  └─ freshclam.conf
   └─ healthchecks/
      └─ README.md
```

## Service boundaries

- **PostgreSQL** stores application state. A separate `keycloak` database is created on first initialization for the identity service.
- **Keycloak** provides local OIDC authentication. The realm export contains development-only fixture accounts.
- **MinIO** is private object storage. The application user receives a least-privilege policy for the `medical-documents` bucket; anonymous access remains disabled.
- **ClamAV** scans quarantined uploads before documents can become active.
- **LiveKit** provides local WebRTC media transport. API credentials are supplied through environment variables rather than committed to `config.yaml`.

## Local startup contract

1. Copy `.env.example` to `.env` and replace all `replace-with-...` values.
2. Start infrastructure with `docker compose up -d`.
3. Wait until PostgreSQL, Keycloak, MinIO, ClamAV and LiveKit report healthy.
4. Run `npm --workspace @medicare/api run migrate`.
5. Start API and Web processes.

The SQL files under `docker-entrypoint-initdb.d` only initialize a brand-new PostgreSQL volume. The migration runner remains the authoritative upgrade path for an existing database.

## Production boundary

This compose file is a local integration architecture, not a production deployment manifest. Production still requires TLS, secret management, external backups, monitoring, country-specific networking/data-residency controls, a real payment provider, production mail/SMS adapters, TURN/network validation for LiveKit and an appropriate Keycloak deployment topology.
