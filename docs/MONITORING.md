# Stage 22 — remote patient monitoring

Status: source-complete, runtime-unverified (no PostgreSQL on this workstation).

## Why this stage exists

After a consultation the patient may need blood pressure, pulse, SpO2, glucose, weight or
temperature tracking. The roadmap requires this as a structured clinical program with alerts for
the treating doctor, not as a chat thread with numbers.

## Schema (migration `033_remote_monitoring.sql`)

| Table | Purpose |
|---|---|
| `monitoring_programs` | program definition (title, condition, organization, active) |
| `patient_monitoring_enrollments` | patient ↔ program ↔ treating doctor, status `active/paused/completed/cancelled`; only one live enrollment per program/patient |
| `medical_devices` | patient device registry (`blood_pressure`, `pulse`, `spo2`, `glucose`, `weight`, `temperature`, `symptom`) |
| `measurements` | value, unit, metric, measurement time, source (`manual/device/import`), author |
| `measurement_thresholds` | per program and metric: `min_value` / `max_value` with severity |
| `clinical_alerts` | out-of-range event linked to the measurement and threshold, with status `open/acknowledged/resolved/dismissed` |
| `monitoring_reviews` | doctor's periodic review with summary and action |

Design rules:

- a measurement always belongs to an enrollment, so it always has a program and a treating doctor;
- thresholds are evaluated at ingest time inside the same transaction, so an out-of-range value can
  never exist without its alert;
- alert messages are technical (`Measurement systolic is out of the configured range`) and contain
  no clinical interpretation;
- enrollment requires an existing doctor–patient relationship (appointment or medical encounter).

## API

| Method | Route | Who |
|---|---|---|
| GET | `/v1/monitoring/programs` | any authenticated user |
| POST | `/v1/monitoring/programs` | verified doctor |
| GET/POST | `/v1/monitoring/programs/:id/thresholds` | authenticated / verified doctor |
| GET | `/v1/monitoring/enrollments` | own enrollments (doctor or patient owner) |
| POST | `/v1/monitoring/enrollments` | verified doctor, only their own patient |
| GET/POST | `/v1/monitoring/enrollments/:id/measurements` | enrollment participants / patient or doctor |
| GET | `/v1/monitoring/alerts?status=open` | treating doctor only |
| POST | `/v1/monitoring/alerts/:id/status` | treating doctor only |
| GET/POST | `/v1/monitoring/enrollments/:id/reviews` | participants / treating doctor |

Every mutation is written to `audit_events` (`monitoring.*`), without clinical text.

## Deliberate gaps

- No device integration: measurements are entered manually or imported; `medical_devices` is a
  registry, not a connectivity adapter.
- Alerts are not pushed through the notification pipeline yet; they are visible to the doctor
  through the API.
- No admin/doctor UI yet.
- No automatic enrollment on discharge from hospital; enrollment is explicit.
- No per-patient personal thresholds — only program-level thresholds.
- Retention for measurements is not automated; it must be added as a data class in Stage 17 before
  real use.

## Verification

- API typecheck: PASS
- production build and API boot: see the Stage 22 commit
- migrations `032`/`033` syntax parsed; not executed (no PostgreSQL here)
