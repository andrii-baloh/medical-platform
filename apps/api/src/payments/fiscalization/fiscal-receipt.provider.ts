/**
 * Fiscal-receipt boundary (54-ФЗ / online KKT).
 *
 * MedicalPlatform never talks to a cash register directly. It books a receipt
 * row, and a provider adapter performs the fiscal registration through the
 * acquiring bank's KKT service. Swapping the KKT operator (Robokassa,
 * ATOL, Orange Data, ...) must not touch payment or medical logic.
 */

/** First (prepayment) and final (full payment) receipts required by FFD 1.2. */
export type FiscalReceiptKind = "prepayment" | "full_payment";

export type FiscalRegistrationInput = {
  receiptType: FiscalReceiptKind;
  /** Local fiscal operation number used as the receipt `id` at the provider. */
  externalReceiptId: number;
  /** Provider invoice reference of the paid operation (Robokassa `InvId`). */
  originExternalReference: number;
  amountMinor: number;
  currency: string;
  description: string;
  clientEmail: string | null;
  clientPhone: string | null;
};

export type FiscalRegistrationOutcome = "submitted" | "failed" | "not_provided";

export type FiscalRegistrationResult = {
  outcome: FiscalRegistrationOutcome;
  providerReceiptId: string | null;
  errorCode: string | null;
  response: unknown;
};

export type FiscalCheckState = "pending" | "confirmed" | "failed" | "not_provided";

export type FiscalReceiptState = {
  state: FiscalCheckState;
  fnNumber: string | null;
  documentNumber: string | null;
  documentAttribute: string | null;
  registeredAt: string | null;
};

export type FiscalStateQuery = {
  externalReceiptId: number;
  originExternalReference: number;
};

export interface FiscalReceiptProvider {
  readonly name: string;
  /** Submits the receipt for fiscal registration. Throws on retryable transport errors. */
  register(input: FiscalRegistrationInput): Promise<FiscalRegistrationResult>;
  /** Reads the fiscal registration result: FN number, document number, fiscal attribute. */
  getState(query: FiscalStateQuery): Promise<FiscalReceiptState>;
}

export const FISCAL_RECEIPT_PROVIDER = Symbol("FISCAL_RECEIPT_PROVIDER");
