# Validation notes — 0.4

Checks performed in the build environment:

- Parsed/transpiled all 65 `.ts` / `.tsx` source files with the installed TypeScript compiler API: **0 syntax diagnostics**.
- Parsed the Keycloak realm JSON after adding local doctor/patient identities.
- Extracted the JavaScript from `doctor-preview.html` and passed it through `node --check`: **no syntax errors**.
- Preserved migration `001_initial.sql`; all doctor-workspace schema changes are isolated in new migration `002_doctor_workspace.sql`.
- Kept local doctor/patient identity fixtures out of normal migrations in `db/dev/999_dev_doctor_seed.sql`.

Checks that could not be completed in this environment:

- `npm install` timed out before dependencies were downloaded, so a full Next.js/NestJS typecheck/build was not possible here.
- Docker and `psql` are not installed in this runtime, so the PostgreSQL migrations and full local stack could not be executed end-to-end here.

The repository should therefore still receive the normal local/CI validation sequence before deployment:

```bash
npm install
npm run typecheck
npm run build
docker compose -f infra/docker-compose.dev.yml up -d
npm --workspace @medicare/api run migrate
```

Then exercise patient booking and the doctor start → draft → sign → complete flow against PostgreSQL.
