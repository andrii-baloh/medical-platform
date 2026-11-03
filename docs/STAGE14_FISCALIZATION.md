# Stage 14 — payments, 54-ФЗ fiscalization and KKT

Status: source-complete, runtime-unverified (no Docker/PostgreSQL on the HP workstation used for this change).

## Why this stage exists

The roadmap requires Stage 14 to be a real payment contour, not a `payments` row:
a provider boundary, webhook verification, refunds and **online KKT receipts** that
satisfy 54-ФЗ. Stage 13 already produced the commercial contract gate; Stage 14
closes the money-and-fiscal loop.

## What already existed before this change (uncommitted work-in-progress)

- `PaymentProvider` boundary with `development` and `robokassa` adapters.
- `@robokassa/sdk` (MIT) integration for invoices, callbacks, refunds.
- Migration `026_payment_provider_references.sql` — provider invoice numbering.
- Migration `027_payment_fiscalization.sql` — durable receipt queue table, unused by code.
- `docker-compose.production-providers.yml` overlay.

The gap: the fiscal queue had **no producer, no worker, no API and no UI**, so a paid
consultation never produced a fiscal record, and the "final receipt" duty was lost.

## Ready components used (no protocol code written from scratch)

| Component | License | Role |
|---|---|---|
| [`@robokassa/sdk`](https://github.com/robokassa/sdk-node) 1.0.0 | MIT | Invoice creation, callback verification, refunds, **second-receipt signing/transport** (`receipt.sendSecondCheck`, `receipt.getCheckStatus`) |
| [Robokassa second receipt docs](https://docs.robokassa.ru/ru/second-receipt) | — | Canonical payload, status codes `None/Wait/Done/Fail/NotProvided`, fiscal attribute names |
| `documents/scanning/document-scan.worker.ts` (in-repo) | — | Proven claim/lease/heartbeat worker pattern reused for the receipt queue |
| `outbox` + `payment_events` patterns (in-repo) | — | Idempotency and audit conventions |

## What this change adds

### Migration `028_payment_fiscal_lifecycle.sql`

- payment states widened to `created, pending, authorized, paid, failed, refunded,
  partially_refunded, cancelled` (roadmap wording);
- fiscal columns on `payment_fiscal_receipts`: `fiscal_fn_number`,
  `fiscal_document_number`, `fiscal_document_attribute`, `fiscal_registered_at`,
  `client_email`, `client_phone`;
- `payment_webhooks` — raw callback hash, signature presence/validity and outcome,
  separate from the normalized `payment_events` stream.

### Fiscalization boundary

`apps/api/src/payments/fiscalization/`

- `fiscal-receipt.provider.ts` — provider-neutral contract (`register`, `getState`)
  so a different KKT operator can be added without touching payments or medical code;
- `robokassa-fiscal-receipt.provider.ts` — thin adapter over the SDK: builds the
  documented second-receipt payload, maps `ResultCode` and `Statuses[].Code`, parses
  `FiscalDate`, and stores only attributes confirmed by the operator;
- `development-fiscal-receipt.provider.ts` — performs nothing and marks rows
  `not_provided`; it never fakes a fiscal receipt;
- `fiscal-receipts.service.ts` — enqueues the final receipt **inside the same
  transaction** as appointment completion (`unique (payment_id, receipt_type)`
  makes it idempotent) and exposes patient/admin read models;
- `fiscal-receipt.worker.ts` — lease-based queue worker: register → poll status →
  confirm; retries transport failures, stops retrying on a final KKT decision.

### Wiring

- `payments.module.ts` binds `FISCAL_RECEIPT_PROVIDER` to the same acquirer that
  took the money (a KKT service belongs to that provider, not to a separate vendor);
- `doctor-workspace.service.ts` queues the receipt when the consultation is
  completed, together with the existing `appointment.completed` outbox event;
- `payments.service.ts` records every callback in `payment_webhooks` with its
  verification outcome, and keeps `payment_events` as the idempotency boundary;
- `GET /v1/payments/appointments/:appointmentId/receipts` — patient, own data only;
- `GET /v1/admin/payment-receipts` — admin read model without clinical text;
- Web: receipt state in `CommercialCheckoutCard` and a KKT section on `/admin/payments`.

## Flow

```
appointment paid          → Robokassa issues the first (prepayment) receipt
appointment completed     → payment_fiscal_receipts row (full_payment, pending)
worker tick               → Receipt/Attach (signed by @robokassa/sdk)
worker tick               → Receipt/Status → fiscal FN / document / attribute
patient + admin UI        → receipt state and fiscal data
```

Failure handling: transport errors keep the row `pending`/`submitted` with an
incremented attempt counter until `FISCAL_RECEIPT_MAX_ATTEMPTS`; a KKT `Fail` or
`NotProvided` is terminal and visible in the admin screen instead of being retried
forever.

## Known limitations (must not be reported as production-complete)

- The first (prepayment) receipt is issued by Robokassa with the payment; its fiscal
  attributes are not exposed to the platform, so only the final receipt is tracked
  field-by-field.
- Receipt delivery address: the final receipt uses the patient account email or the
  profile phone. Invoice creation (`invoices.create`) in the SDK payload has no
  customer-email field, so first-receipt delivery depends on the merchant's
  Robokassa settings.
- Correction receipts (`Receipt/Register` correction flow) and refund receipts are
  not implemented yet; refunds currently only return money through the refund API.
- No live merchant credentials, KKT contract or test contour were available, so no
  fiscal registration has been executed end-to-end. Docker/PostgreSQL are absent on
  this workstation; migration `028` is source-verified only.

## Operations

Required for real fiscalization:

```
PAYMENT_PROVIDER=robokassa
ROBOKASSA_MERCHANT_LOGIN / ROBOKASSA_PASSWORD1..3
ROBOKASSA_TEST_MODE=false
ROBOKASSA_SNO=osn            # tax system of the medical organization
PUBLIC_WEB_URL=https://...   # customer-facing site in the receipt
FISCAL_RECEIPT_WORKER_ENABLED=true
```

Before enabling for real patients: connect `Receipt/Attach` and `Receipt/Status` in
the Robokassa test contour, verify a confirmed receipt reaches the patient's inbox,
and reconcile the fiscal document number with the OFD cabinet.
