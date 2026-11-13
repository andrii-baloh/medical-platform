# Existing-first integration plan — telemedicine (2026-11-13)

Status: **research and implementation gates only**. No production integration is claimed here.

## Non-negotiable direction

MedicalPlatform is an existing commercial telemedicine application intended for Russia, not a greenfield application. **Keep the existing Next.js/NestJS/PostgreSQL architecture and all patient authorization, audit and immutable clinical-record boundaries.** Reuse mature OSS components rather than writing replacements. Introducing a second conferencing backend or another canonical patient database must require an explicit architecture decision and migration plan.

Existing source integration points to preserve:

- `apps/api/src/video/video.provider.ts` and `apps/api/src/video/providers/livekit-video.provider.ts`: provider-neutral video boundary and existing LiveKit implementation.
- `apps/api/src/video/video.service.ts` and `apps/api/src/telemedicine/telemedicine.service.ts`: room authorization and clinical session lifecycle.
- `apps/api/src/documents/documents.service.ts` and `apps/api/src/documents/scanning/document-scanner.provider.ts`: secure document pipeline, quarantine/scanning.
- `apps/api/src/auth/`, `apps/api/src/audit/`: access-control and audit boundaries.
- `docs/SECURITY.md`, `docs/DATA_RESIDENCY.md`, `docs/TELEMEDICINE_SESSION.md`: unresolved deployment acceptance gates.

## Reuse candidates

| Priority | OSS project / source | Licence (upstream repository) | Appropriate use | Decision |
|---|---|---|---|---|
| P0 | [LiveKit server](https://github.com/livekit/livekit), [client and React components](https://github.com/livekit/components-js) | Apache-2.0 server; verify any selected package separately | Keep the current provider. Evaluate existing SDK components for call UI, device selector, reconnect and participant state. | **Reuse existing**; verify package compatibility and licence before adding a dependency. |
| P1 | [OpenVidu Meet / Platform](https://github.com/OpenVidu/openvidu) | Apache-2.0 repository; inspect specific distribution and deployment terms | Proof-of-concept for an embeddable room UI, moderation, chat and media workflows. OpenVidu is itself built on LiveKit/mediasoup. | **Spike only**, behind `video.provider.ts`; do not introduce a second production media service by default. |
| P1 | [Medplum](https://github.com/medplum/medplum) | Apache-2.0 (upstream) | Evaluate FHIR resource models, validation and an adapter for `Patient`, `Practitioner`, `Appointment`, `Encounter`, `DocumentReference`. | **Evaluate adapter only**; do not migrate the canonical patient store or expose clinical data to an external service. |
| P2 | [HCW@Home v6](https://github.com/hcw-home/hcw) | Check applicable version's licence; upstream project publicly describes GPLv3 | Review video consultation UX, patient invitations and clinician workflow in a mature domain-specific app. | **Architectural reference only** pending licence review; do not copy GPL code into this commercial repository. |
| P2 | [OpenEMR](https://github.com/openemr/openemr) and [OpenVisit](https://github.com/alexandrududuman/oe-module-openvisit) | GPL-family; verify per component | Compare scheduling, medical encounter and telehealth workflows; avoid reimplementing domain problems already solved elsewhere. | **Reference only**; not a drop-in replacement for the NestJS stack. |

Sources were reviewed on 2026-11-13. Upstream licences and package versions must be checked at adoption time.

## Short delivery sequence — minimum custom code

### 1. Inventory before installing anything

- Run the existing tests, type checks, production build, `npm audit`, migration validation and Trivy jobs already present in `.github/workflows/ci.yml`. Do not create duplicate CI checks.
- Record the installed versions of `livekit-client`, `livekit-server-sdk`, existing React/UI dependencies, and current call-flow components.
- Map a single complete journey: patient books an appointment → verified consent/payment gates (as applicable) → authorized doctor/patient room join → technical session → clinical conclusion → immutable audit.
- Record blockers that cannot be validated without PostgreSQL, Keycloak, LiveKit, ClamAV and provisioned integrations as **unverified**, not passed.

### 2. Reuse the existing LiveKit SDK first

- Identify whether existing client components support reconnect, device permissions, unsupported-browser errors and remote participant loss.
- Prefer existing upstream LiveKit UI components or documented primitives to custom WebRTC event handlers.
- Add a focused, deterministic test for one verified deficiency; avoid adding a new media provider unless tests demonstrate a need.

### 3. Optional embed spike

- Evaluate OpenVidu Meet only in a separate branch and local synthetic-data environment.
- Compare its room permissions and guest workflow with the current API-side authorization; never rely on a client-side URL to grant clinical access.
- Do not record, transmit or upload real patient content to a public demo instance.

### 4. FHIR interoperability assessment

- Document the explicit mapping to the existing immutable versioned medical documents and encounters.
- Validate against FHIR resources using a library or reference implementation rather than ad-hoc JSON schemas.
- Keep identifiers, retention, residency, consent, authorization and audit decisions on the current platform side.

## Definition of done for any reused component

1. Upstream source, licence, version, maintenance status, and any transitive dependencies recorded.
2. No hidden patient-data egress; deployment and data residency documented for the target jurisdiction.
3. Existing access-control, clinical signing, immutable versioning and audit tests remain green.
4. End-to-end test with two roles (patient and physician) and synthetic data; no unexplained silent fallbacks.
5. Deployment and recovery tested, with secrets provided through the configured vault/secret mechanism.
6. No production-readiness claim without live acceptance evidence and review of jurisdiction-specific legal requirements.

## Agent delegation contract

Independent tasks suitable for parallel agents, **only after each agent successfully returns a real task result**:

- **Codex:** inspect the existing LiveKit room lifecycle and produce a path-specific low-code patch and focused tests.
- **Qwen:** compare existing UI to reusable LiveKit components, propose a limited React integration patch in its own worktree.
- **DeepSeek:** identify FHIR/consent and interoperability mapping gaps against the actual DTOs without writing a second clinical database.
- **MiMo / Gemini:** optional independent reviewer/QA role, only if their actual model-provider authentication works.

All agents must use separate Git worktrees/branches, no production secrets or real patient data, and must deliver concrete file changes + passing tests before a claim of completed team work. This document does not assert that the agents are connected.
