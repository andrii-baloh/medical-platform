# Stages 14–15 runtime audit — 2026-11-05

All runtime tests ran exclusively in the standalone synthetic PostgreSQL 17 database
`medicare_check` on port 55434 on Orest's PC. Tests do not invoke Robokassa, an actual fiscal service, or a live video client. No real patient records, credentials, or payments were used.

## Stage 14 — Payment webhook transition safety

**Finding:** the verified webhook handler serialized changes to a payment row, but previously accepted any subsequent provider status. An out-of-order `failed` event could regress a `paid` payment.

**Fix:** `canAdvancePaymentStatus` validates state transitions under the existing row lock before updating. Unknown, repeated, final, or stale events are recorded once in the normalized event history but do not overwrite the payment or enqueue another status-changed event.

Unit tests: `src/payments/payments-status.test.ts`.
Real PostgreSQL integration test: `apps/api/scripts/test-stage14-payment-runtime.cjs`. The synthetic callback sequence `paid → failed → paid (replay)` produced final payment `paid`, two distinct payment-event records, and one outbox status change: **PASS**.

**Limitations:** does not test a real Robokassa signature, fiscal receipts, refund provider callbacks, or settlement accounting. A legitimately late paid callback after a locally terminal `failed` state requires manual reconciliation; this conservative policy intentionally avoids resurrecting a terminal payment automatically.

## Stage 15 — Telemedicine session lifecycle

Integration test: `apps/api/scripts/test-stage15-telemedicine-runtime.cjs`.

Tested actual DB transaction methods for creation, room-opened, doctor and patient joined, connection loss, reconnecting, rejoin, doctor left, idempotent session creation, authorized patient read, unrelated user denied, and appointment completion.

Result: **PASS**; one session, one recorded disconnection, nine timeline events, final status `completed`.

**Limitations:** no actual LiveKit room join, two-browser media transport, network reconnection, recording provider, or authenticated browser end-to-end test.

## Test prerequisites

1. Build the API: `npm run build --workspace @medicare/api`.
2. Run scripts with `DATABASE_URL` set to the isolated `medicare_check` database on port `55434`. Both scripts explicitly refuse other targets.
3. Test fixtures remain in that standalone disposable test database, not in the legacy development stack.

## Production blockers remain

End-to-end 54-FZ fiscalization, actual Robokassa settlements, real multi-user LiveKit sessions, key custody/MFA, independent restore verification, reliable incident/monitoring notifications, security scans, and clinical/regulatory review.
