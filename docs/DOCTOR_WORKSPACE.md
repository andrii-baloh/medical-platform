# Doctor workspace — MediCare 0.13

The doctor workspace is available only to an authenticated account linked to a verified doctor profile.

## Main capabilities

- dashboard with upcoming work and appointment metrics;
- working calendar and concrete appointment slots;
- patient list restricted by appointment relationship;
- patient card with the doctor's appointment history and explicitly granted documents;
- appointment workspace with consultation state transitions;
- clinical draft fields for complaints, anamnesis, assessment and recommendations;
- immutable signed consultation-version snapshots with SHA-256 chaining;
- explicit amendment workflow after signing;
- LiveKit room creation/join for appointment participants;
- document access only through ownership/grant checks.

## Clinical version rules

A signed clinical version is historical evidence and must not be edited or deleted through normal application flows. If a correction is needed, create an amendment/new editable version and sign that version separately.

## Authorization rules

Doctor UI visibility is not a security control. Every API endpoint must independently verify the authenticated user, linked verified doctor profile, appointment/patient relationship and any document grant needed for the requested resource.

## Local development

The development Keycloak realm includes a doctor fixture linked by identity subject to the development database seed. These fixtures are only for local testing.
