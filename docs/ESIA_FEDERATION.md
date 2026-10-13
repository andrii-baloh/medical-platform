# ESIA federation foundation
Production flow: **ESIA -> Keycloak Identity Federation -> MedicalPlatform**. Keycloak remains the application OIDC issuer.

Required Keycloak mappers for brokered ESIA users: `identity_provider=esia`, stable `esia_id`, boolean `esia_verified`. The API ignores `esia_id` unless the signed Keycloak token also identifies the ESIA provider. Claim names are configurable via `ESIA_PROVIDER_CLAIM`, `ESIA_PROVIDER_VALUE`, `ESIA_ID_CLAIM`, `ESIA_VERIFIED_CLAIM`.

Persistence: `federated_identities`, `federated_auth_events`, `patient_identity_matches`, and read-only `representative_identity_status`.

Rules: one active ESIA subject per account; one account per ESIA subject; conflicts are rejected rather than reassigned; only the self-owned patient profile is auto-matched after verified ESIA authentication; dependent/child profiles are never auto-matched; representative permissions still come exclusively from Stage 9 scopes; no browser endpoint accepts an arbitrary ESIA ID for linking.

Real ESIA authorization endpoints, certificates and customer credentials are deployment integration work. They belong in Keycloak IdP configuration, not clinical services.
