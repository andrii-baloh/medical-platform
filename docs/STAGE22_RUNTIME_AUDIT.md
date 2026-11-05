# Stage 22 — Remote monitoring runtime audit

Tested on Orest PC on 2026-11-05. Source branch: `feat/integrated-stages14-22`. Test database: an isolated PostgreSQL 17 container `medicare-deepseek-stagecheck`, database `medicare_check`, port 55434. Test subjects were synthetic. The legacy MediCare containers, their databases, and the separate Stage 21 development stack were not changed.

## Findings fixed
1. `MonitoringService.requireDoctor()` queried `doctor_profiles.organization_id`, a nonexistent column. Corrected to resolve the current active doctor-to-organization membership in `doctor_organization_memberships`.
2. Any verified doctor could configure thresholds on any program. Threshold creation now requires ownership (`created_by_user_id`) of an active program.
3. An enrollment could reference an active device belonging to a different patient. Device ID is validated against the enrollment patient **inside the transaction** before a measurement is inserted.
4. A race with enrollment deactivation could permit a measurement after a status change. Enrollment is locked and rechecked for active status inside the insertion transaction.
5. Enrollment access allowed a former doctor merely because their user ID was still referenced. It now also checks the current OIDC doctor role and the stored `user_roles` doctor role.
6. Vitest picked up compiled `dist/*.test.js`, failing due to CommonJS/ESM mismatch after compilation. Restricted test discovery to `src/**/*.test.ts` and `src/**/*.spec.ts` in `vitest.config.mts`.

## Tests
- API + Web `npm run typecheck`: PASS.
- All source API tests with `npm run test --workspace @medicare/api`: 11 PASS (7 incidents, 4 monitoring).
- `npm run build --workspace @medicare/api`: PASS.
- `apps/api/scripts/test-stage22-runtime.cjs`: PASS against real PostgreSQL 17. Tested synthetic doctor and patient creation, program and threshold creation, forbidden foreign program edit, forbidden foreign device, out-of-range pulse creating exactly one alert in the same service transaction, normal measurement producing no alert, and denial of unrelated patient access.

## Remaining gaps
No actual device ingestion, notification dispatch for monitoring alerts, full browser E2E or clinical staff sign-off. Production security requirements (MFA, backups, key custody, legal hold, incident alerts) are still blockers. Threshold ranges are synthetic test values and must not be treated as clinical recommendations. Runtime test leaves synthetic records in the isolated test database only.
