# Data residency — MediCare 0.13

MediCare is designed so country deployments can be isolated rather than placing all medical data in one global database.

## Principle

Patient records, medical documents, audit records, video metadata and operational backups should remain in the deployment cell selected for the launch country unless a documented legal basis and explicit architecture decision permit cross-border processing.

## Deployment cell

A production country cell should have its own:

- PostgreSQL database and backups;
- private object-storage bucket and encryption keys;
- identity-provider tenant/realm or equivalent isolated configuration;
- video/payment/notification providers selected for that country;
- audit/observability storage and retention policy;
- disaster-recovery plan and tested restore path.

`DEPLOYMENT_COUNTRY` is application metadata and is not, by itself, a data-residency control. Residency must be enforced by infrastructure placement, provider contracts/configuration and operational procedures.

## Cross-border access

Administrative and support access should be least-privilege, logged and restricted to approved personnel and locations. Do not replicate clinical data to another country merely for convenience.

Country-specific legal requirements must be reviewed before using the platform with real patients.
