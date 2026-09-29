# Validation notes — 0.5

Validation performed on the Windows development machine after the 0.5 implementation.

## Passed

- `npm run typecheck` — **exit 0**.
  - `@medicare/api` TypeScript check passed.
  - `@medicare/web` TypeScript check passed.
- `npm run build` — **exit 0**.
  - NestJS API production build passed.
  - Next.js 15.5.26 production build passed.
  - Next generated the new `/consultations/[id]` and `/notifications` routes successfully.
- The final Next.js build completed without the previous incorrect workspace-root warning after setting `outputFileTracingRoot`.
- LiveKit server/client dependencies resolve during typecheck and production build.
- Migration runner still scans versioned SQL files from `db/migrations`, including new migrations `003` and `004`.

## Attempted but not available in this environment

`npm --workspace @medicare/api run migrate` was executed and failed with `ECONNREFUSED` for `localhost:5432`. PostgreSQL is not running on this computer, so the SQL migrations have **not** been runtime-validated against PostgreSQL.

`docker --version` was executed and Windows reported that the `docker` command is not available. Therefore the local PostgreSQL / Keycloak / MinIO / LiveKit compose stack has **not** been started or verified here.

## Runtime scenarios still required

Once Docker/PostgreSQL are available, run the compose stack, apply migrations, then verify with two authenticated browsers:

1. patient books an appointment;
2. doctor sees the appointment;
3. patient and doctor receive separate short-lived LiveKit tokens for the same room within the allowed time window;
4. unrelated patient/doctor accounts are denied;
5. doctor saves a draft, signs the conclusion and completes the appointment;
6. patient never receives the mutable draft and can read only immutable signed versions;
7. `consultation.signed` produces one deduplicated in-app notification;
8. retrying an outbox event does not duplicate the notification;
9. two worker instances cannot process the same leased outbox event concurrently;
10. video room closure and join/leave audit metadata contain no token or clinical free text.

No claim of production, medical, legal or country-specific compliance is made by these engineering checks.
