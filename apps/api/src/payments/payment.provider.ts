export type PaymentStatus = "created" | "authorized" | "paid" | "failed" | "refunded" | "partially_refunded";

export type CreatePaymentSessionInput = {
  paymentId: string;
  appointmentId: string;
  amountMinor: number;
  currency: string;
  customerReference: string;
};

export type CreatePaymentSessionResult = {
  providerPaymentId: string;
  providerSessionId: string;
  checkoutUrl: string | null;
};

export type VerifiedPaymentEvent = {
  providerEventId: string;
  eventType: string;
  providerPaymentId: string;
  status: PaymentStatus;
};

export type RefundRequestResult = {
  accepted: boolean;
  providerRefundId?: string;
};

export interface PaymentProvider {
  readonly name: string;
  createSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult>;
  verifyWebhook(signature: string | undefined, body: unknown): Promise<VerifiedPaymentEvent>;
  requestRefund(paymentProviderId: string, amountMinor: number): Promise<RefundRequestResult>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
