# Stage 15 — telemedicine session

Status: source-complete, runtime-unverified (no Docker/PostgreSQL, no LiveKit server on this workstation).

## Why this stage exists

A LiveKit room is transport. The roadmap requires the consultation itself to be a medical
session: `appointment → encounter → telemedicine session`, with join evidence, technical
state and a closed lifecycle. Before this change the platform created `video_rooms` and
`video_join_events` only — there was no entity that a medical record, a conclusion or an
audit could point at.

## What already existed (unchanged)

- `livekit-video.provider.ts` — the only place that imports the LiveKit SDK;
- `video_rooms` — one provider room per appointment, with technical room names only;
- `video_join_events` — token issuance / join / leave audit per participant;
- `VideoService` — participant authorization, server-side join window, room close by the doctor;
- `VideoCallPanel` — patient and doctor UI for the call itself.

Stage 15 does not rewrite any of these. It adds the clinical layer around them.

## What was added

### Migration `029_telemedicine_sessions.sql`

- `telemedicine_sessions` — one row per appointment, optionally linked to the medical
  encounter and to the transport room; `status` (`scheduled/waiting/active/completed/failed/cancelled`),
  `technical_status`, `recording_status`, first-join timestamps, `started_at`/`ended_at`,
  `disconnect_count`, technical `metadata`;
- `telemedicine_session_events` — append-only timeline (`session_created`, `room_opened`,
  `participant_joined`, `participant_left`, `connection_lost`, `reconnecting`,
  `technical_failure`, `recording_status_changed`, `session_completed`, `session_failed`,
  `session_cancelled`) with actor and role.

No clinical text and no join token is ever written to either table.

### API

`apps/api/src/telemedicine/`

- `TelemedicineService.ensureForRoomTx` creates the session inside the same transaction that
  provisions the room, so a room can never exist without its session (and rooms created before
  this migration get a session on next join);
- `recordParticipantEventTx` keeps first-join timestamps, marks the session `active`, and counts
  real connection losses separately from technical failures;
- `completeForAppointmentTx` closes the session when the room closes, the appointment is
  completed or the appointment is cancelled;
- `GET /v1/telemedicine/appointments/:id/session` — patient/doctor read model with the last 50
  timeline events;
- `POST /v1/telemedicine/appointments/:id/connection-issues` — a participant reports
  `reconnecting`, `connection_lost` or `technical_failure`; the client cannot forge a join.

### Wiring

- `VideoService` now creates the session on room provisioning and appends join/leave and
  connection events to the session timeline in the same transaction as the room update;
- `DoctorWorkspaceService.completeAppointment` / `cancelAppointment` close the session, so an
  appointment finished without a `video/close` call still ends the clinical session;
- `VideoCallPanel` shows session status, disconnect count and recording state, and reports an
  unexpected `Disconnected` as `connection_lost` (an intentional "leave" is not reported).

## Explicit non-goals

- Recording is **state only**. There is no LiveKit egress deployment, no recording storage and no
  recording playback; `recording_status` stays `not_recorded` and the UI says so.
- Chat and consultation materials are Stage 16 (`ConsultationMaterial`), not part of this table.
- No retention policy is applied to the session timeline yet (Stage 17).

## Verification

- API and Web typecheck: PASS
- production build: PASS
- infrastructure static validation: PASS
- migration `029` syntax: parsed successfully
- API boot with a stub environment: PASS (module graph resolved, routes mapped)

Not verified: actual PostgreSQL execution of `029`, a real LiveKit room lifecycle, and the
join window against a running SFU.
