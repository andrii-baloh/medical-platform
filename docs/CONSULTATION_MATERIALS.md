# Stage 16 — consultation chat and materials

Status: source-complete, runtime-unverified (no Docker/PostgreSQL on this workstation).

## Why this stage exists

A consultation is not only a video call: patients send photos, documents, voice notes and
text questions, and the doctor answers. The roadmap requires every such object to belong to
the medical encounter, not to float in a separate chat store.

## What already existed (unchanged)

- `medical_documents` + MinIO + ClamAV scanning — the only file pipeline;
- `document_grants` — doctor access to a patient document;
- `medical_encounters` — the clinical case, 1:1 with an appointment;
- `VideoCallPanel`, `VideoService` and the LiveKit provider — untouched by this stage.

## What was added

### Migration `030_consultation_materials.sql`

`consultation_materials` — one row per chat message or attached material:

- `encounter_id` and `appointment_id` are mandatory, so an orphan chat cannot exist;
- `material_type` — `chat`, `file`, `image`, `voice`, `video`, `recording`, `measurement`;
- `document_id` — set for file-backed materials and null for chat;
- `body` — chat text only;
- `metadata` — measurement payload and future technical attributes;
- a CHECK constraint keeps the shapes honest (chat requires text, file types require a
  document, measurement requires metadata);
- a unique constraint prevents attaching the same document twice.

No retention or deletion logic is implemented here — that is Stage 17.

### API

`apps/api/src/consultation-materials/`

- `GET /v1/consultation-materials/appointments/:appointmentId` — timeline with `canPost`
  flag, cursor (`before`) and limit; patient and doctor only;
- `POST /v1/consultation-materials/appointments/:appointmentId/chat` — text message;
- `POST /v1/consultation-materials/appointments/:appointmentId/documents` — attaches an
  existing `medical_documents` row; the actor must already be allowed to read that document
  (owner or active doctor grant) and the document must belong to the same patient.

Rules:

- the consultation is writable while the encounter is `scheduled`, `waiting` or `active`;
- after completion, cancellation or no-show it is read-only;
- if the appointment exists but the medical encounter has not been created yet, the API
  answers `409` instead of silently creating a clinical case;
- chat text is never copied into `audit_events`; audit stores only type, role and ids.

### Web

`ConsultationChat` is mounted in the patient consultation page and in the doctor
consultation workspace: message list, compose box, read-only state after completion, and a
document picker on the doctor side (the patient document list is already loaded there).
Attachments are opened through the existing document download endpoint.

## Explicit non-goals

- No retention policy, deletion or export — Stage 17.
- No recording engine — recording remains state-only from Stage 15.
- No new storage backend: files keep going through `medical_documents` + MinIO + ClamAV.
- Patient-side attachment picker needs its own document list; the API already supports it.

## Verification

- API and Web typecheck: PASS
- production build: PASS
- infrastructure static validation: PASS
- migration `030` syntax: parsed successfully
- API boot with a stub environment: routes mapped, no DI errors

Not verified: actual PostgreSQL execution of `030`, and a real end-to-end chat between two
authenticated participants (requires the Docker stack).
