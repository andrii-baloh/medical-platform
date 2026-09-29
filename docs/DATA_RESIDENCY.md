# Data residency strategy

"CIS" is not one legal jurisdiction. Final hosting, consent texts, retention, telemedicine requirements, e-signature requirements and cross-border-transfer rules must be validated for each launch country before real patient data is processed.

The codebase therefore avoids a provider-specific database/auth/storage dependency and supports a **country-cell** model.

Each production cell should define:
- `DEPLOYMENT_COUNTRY`
- local PostgreSQL location
- local object-storage location
- encryption/KMS location
- approved identity provider deployment
- approved video provider/region
- approved payment provider
- retention schedule
- incident-response contacts

Do not route patient medical data through a different country merely for operational convenience without a jurisdiction-specific review.
