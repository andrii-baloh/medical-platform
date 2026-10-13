# Security model — MediCare 0.13

## Authentication

NestJS accepts bearer tokens only after OIDC signature, issuer and configured audience validation. Realm and audience-specific roles are read only from the verified token. Elevated doctor/admin access can be configured to require MFA through AMR/ACR checks.

## Authorization

Every sensitive API operation must enforce authorization server-side. Important rules include:

- patient profiles are restricted to their authenticated owner;
- doctor access to patient data requires the relevant doctor/account relationship and appointment relationship;
- doctor workspace access requires a verified doctor profile;
- medical documents are visible to the owner or a specifically granted connected doctor;
- appointment reviews are bound to the appointment owner and one review per appointment;
- audit events must not contain clinical free text or secrets.

## Medical files

Files are uploaded to a private S3 bucket through short-lived signed URLs. Upload completion validates object size, content type, magic bytes and optional client checksum. New uploads enter quarantine and are activated only after the configured scanner pipeline succeeds.

The application S3 account is separate from the MinIO root identity and receives a bucket-scoped policy in local development.

## Clinical records

Signed clinical versions are immutable and hash chained. Changes after signing use an explicit amendment/new-version workflow. Destructive mutation of signed historical clinical snapshots must not be introduced.

## Secrets

Do not commit real credentials. `.env.example` contains local development placeholders only. Production secrets belong in an external secret manager/environment and should be rotated according to the deployment policy.

## Local stack warning

The local Docker stack exposes HTTP development ports and development identities. It is not a production security configuration and must never contain real patient data.
