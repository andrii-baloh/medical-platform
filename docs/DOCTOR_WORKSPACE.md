# Doctor workspace 0.4

The doctor workspace is API-authorized. A verified `doctor_profiles` row must be linked to the authenticated `app_users` row, and that user must have the `doctor` role. A verified OIDC token alone does not select a doctor profile.

## Access boundaries

- A doctor can list only appointments where `appointments.doctor_id` equals the linked doctor profile.
- A patient is visible only after an appointment relationship exists with that doctor.
- Medical documents are not inherited from the appointment relationship. They remain visible only through an active `document_grants` row for that specific doctor.
- Every patient-card and appointment-detail view creates an audit event.
- Document downloads still pass through the existing authorization check and use a short-lived signed S3 URL.

## Clinical conclusion lifecycle

`consultations` contains the current editable working copy. `consultation_versions` contains immutable signed snapshots.

1. Start appointment: appointment becomes `in_progress`; a consultation draft is created if needed.
2. Save draft: editable fields are updated. A signed current version cannot be edited.
3. Sign: the current fields are serialized into a snapshot, chained to the previous signed hash, SHA-256 hashed, inserted into `consultation_versions`, and marked signed.
4. Amendment: after signing, the doctor explicitly opens the next version. The previous signed snapshot remains immutable.
5. Complete: the appointment can be marked `completed` only when the current version is signed.

PostgreSQL has a trigger that rejects `UPDATE` and `DELETE` operations on signed `consultation_versions` rows. This is an integrity control, not a qualified electronic-signature implementation. Country-specific signature/legal requirements must be implemented separately before production use.

## Appointment state history

All new bookings and patient/doctor cancellations now write `appointment_status_history`. Doctor start and completion transitions are recorded there too. `audit_events` remains the cross-domain security/audit trail.

## Schedule model

- `doctor_working_hours` stores the doctor's ordinary weekly template.
- `appointment_slots` remains the bookable source of truth.
- A patient cannot book a working-hours template directly; a concrete future `available` slot must exist.
- The doctor workspace can create, block and reopen future unbooked slots.

A later scheduler worker can materialize concrete slots from weekly templates and country-specific holidays without changing the booking contract.
