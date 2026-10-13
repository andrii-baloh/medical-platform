# Recovery notes — 2026-10-09

The original working directory was:

`C:\Users\orest\OneDrive\Desktop\ПАПА\MedicalPlatform`

It was no longer present locally or in the checked OneDrive recycle bin.

## Sources used

1. Docker Desktop data disk backup: `D:\MedicalPlatformRecovery\docker_data_20261002.vhdx`.
2. Recovered containerd/ext4 content: `D:\MedicalPlatformRecovery\ext4_copy`.
3. AI Supervisor engineering logs: `C:\Users\orest\AppData\Local\MedicalPlatform\AiSupervisor`.
4. Earlier MediCare documentation/source artifacts retained in the ChatGPT file library, used only as historical context where later source was unavailable.

## Exact source recovered from Docker layers

Application source, package manifests, Dockerfiles and database migrations were reconstructed from surviving `/repo` Docker build layers. Where a later snapshot contained zero-filled files, a valid copy with the same repository path was selected from another surviving layer.

Important confirmed files include:

- `db/migrations/001_initial.sql` … `010_patient_engagement.sql`
- `apps/api/src/engagement/engagement.service.ts`
- `apps/api/src/app.module.ts`
- API/Web source trees and package manifests
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`

## Files reconstructed from the surviving accepted CX-001 engineering record

The following were known to exist in the last working tree but were not stored in Docker image layers, so their current copies were recreated to match the documented behavior and acceptance criteria rather than claimed byte-for-byte recovery:

- `.env.example`
- `.dockerignore`
- `docker-compose.yml`
- `docker-compose.override.yml`
- `infra/**`
- `scripts/**`
- root documentation files

The surviving CX-001 report states that the original versions passed YAML/JSON/config checks, API/Web typecheck/build, and generated 22 Next.js pages; Docker runtime was blocked at that time because Docker Desktop was unavailable.

## Verification after recovery

- `npm run typecheck` — PASS / exit 0.
- `npm run build` — PASS / exit 0.
- Next.js production build — PASS, 22 static pages generated.
- `node scripts/check-infra.cjs` — PASS.
- `docker compose --env-file .env.example config --quiet` — PASS.
- PowerShell parser for all `scripts/*.ps1` — PASS.

## Runtime recovery completed

WSL 3.0.1 and Docker Desktop were repaired on 2026-10-09. The missing Windows machine variables `ProgramData` and `ALLUSERSPROFILE` were restored to `C:\ProgramData`. Docker Engine 29.8.0 is operational again.

The recovered historical runtime data is active: PostgreSQL, Keycloak, MinIO, LiveKit and ClamAV are healthy. The reconstructed current API source is running on host port 4100 and uses those real services. The reconstructed current Next.js web source is running on `http://localhost:3000` and points to that API. The temporary in-process demo data layer used while Docker was unavailable has been removed.

The web BFF now enforces the genuine authentication boundary: unauthenticated `/api/backend/me` returns HTTP 401, and NextAuth exposes the Keycloak provider. Public `/doctors` is populated from the live PostgreSQL data through the recovered API rather than from demo constants.

## Additional migrations recovered from the live runtime

The live PostgreSQL database contains applied migrations 001 through 012.

- `011_patient_phone.sql` was recovered byte-for-byte from the surviving API container. Its SHA-256 exactly matches the checksum stored in `schema_migrations` (`f122bce27754d6a307ea14ed83bc57a147f833025d5382e8c9d2426c6a2137ed`).
- `012_icd10_codes.sql` is applied in the live database, but its original source file has not yet been recovered. Do not create a guessed replacement under `db/migrations`, because the migration runner verifies the stored SHA-256 checksum (`6257ad77c79e411b05f49e50fb63a96195afbd599ff559e98aac5adbce7dfde4`).
- The live `icd10_codes` table is intact with 14,915 rows, columns `code`, `name`, `parent`, `level`, and the expected parent and trigram indexes.

## Backups

- `D:\MedicalPlatformRecovery\MedicalPlatform_REAL_CONNECTED_20261009`
- `D:\MedicalPlatformRecovery\MedicalPlatform_REAL_CONNECTED_20261009.zip`
- `D:\MedicalPlatformRecovery\MedicalPlatform_FULL_20261009`
- `D:\MedicalPlatformRecovery\MedicalPlatform_FULL_20261009.zip`
- `D:\MedicalPlatformRecovery\MedicalPlatform_SOURCE_20261009.zip`
- `D:\MedicalPlatformRecovery\docker_data_20261002.vhdx`

The first pair above is the current real-connected source state after removal of the temporary demo layer and recovery of migration 011.
