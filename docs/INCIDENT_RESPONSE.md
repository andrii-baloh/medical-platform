# Stage 21 — security incident response

Status: source-complete, runtime-unverified (no PostgreSQL on this workstation).

## Why this stage exists

152-ФЗ and the security baseline require the organization to detect, contain and report incidents
within legal deadlines. The platform must therefore keep a structured incident record with a
timeline, not a free-form note in a chat.

## Schema (migration `032_security_incidents.sql`)

`security_incidents`:

- `detected_at`, `incident_type`, `severity` (`low/medium/high/critical`), `status`
  (`open/investigating/contained/reported/closed`);
- `title`, `summary`;
- `affected_systems[]`, `affected_data_classes[]`, `affected_users_count` — enough to describe
  scope without copying patient records;
- `investigator_user_id`, `containment_actions`;
- `reporting_deadline`, `regulator_notified_at`, `regulator_reference`;
- `final_report`, creation/update timestamps.

`security_incident_events` is the append-only timeline:
`detected`, `status_changed`, `note`, `containment`, `notified`, `report_attached`.

The incident log stores technical facts and decisions only. It is not a copy of the medical
record, and no clinical text is required to fill it.

## API (admin only)

| Method | Route | Purpose |
|---|---|---|
| GET | `/v1/admin/security-incidents` | list, optional `?status=` filter |
| POST | `/v1/admin/security-incidents` | register an incident (creates the `detected` event) |
| GET | `/v1/admin/security-incidents/:id` | incident with timeline |
| PATCH | `/v1/admin/security-incidents/:id` | scope, containment, investigator, regulator contact, final report |
| POST | `/v1/admin/security-incidents/:id/status` | status transition with an optional note |
| POST | `/v1/admin/security-incidents/:id/notes` | investigation note |

Every action is also written to `audit_events` (`security_incident.create/update/status/note`),
without clinical text.

## Behaviour

- registering an incident writes the first timeline event and cannot be skipped;
- recording containment actions, a regulator notification or a final report adds the matching
  timeline event automatically;
- status changes are allowed in any direction because real investigations move back and forth
  (for example `contained` back to `investigating`), but each change is journaled with actor and
  time;
- `reporting_deadline` is explicit: the platform does not invent legal deadlines, the investigator
  sets the date and the record keeps it.

## Deliberate gaps

- No admin UI yet; the workflow is available through the admin API.
- No automatic deadline reminder or escalation; a scheduler would need the notification pipeline.
- No regulator integration: notification is recorded, not transmitted.
- No attachment storage for evidence; documents must be referenced through the existing document
  pipeline if needed.

## Verification

- API typecheck: PASS
- production build and API boot: see the Stage 21 commit
- migration `032` syntax parsed; not executed (no PostgreSQL here)
