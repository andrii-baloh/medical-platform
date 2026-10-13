import { Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { CreatePaymentSessionInput, CreatePaymentSessionResult, PaymentProvider, PaymentStatus, RefundRequestResult, VerifiedPaymentEvent } from "../payment.provider";

function constantTimeEqual(a: string, b: string) {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

/** Development-only payment adapter. It never handles card data or moves money. */
@Injectable()
export class DevelopmentPaymentProvider implements PaymentProvider {
  readonly name = "development";

  async createSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult> {
    // Stable identifiers make retries idempotent in local development.
    return {
      providerPaymentId: `dev_pay_${input.paymentId}`,
      providerSessionId: `dev_session_${input.paymentId}`,
      checkoutUrl: null,
    };
  }

  async verifyWebhook(signature: string | undefined, body: unknown): Promise<VerifiedPaymentEvent> {
    const expected = process.env.PAYMENT_DEV_WEBHOOK_SECRET ?? "";
    if (!expected || !signature || !constantTimeEqual(signature, expected)) {
      throw new UnauthorizedException("Invalid development webhook signature");
    }
    if (!body || typeof body !== "object") throw new UnauthorizedException("Invalid webhook payload");
    const value = body as Record<string, unknown>;
    const status = value.status;
    const allowed: PaymentStatus[] = ["created","authorized","paid","failed","refunded","partially_refunded"];
    if (typeof value.eventId !== "string" || typeof value.type !== "string" || typeof value.providerPaymentId !== "string" || typeof status !== "string" || !allowed.includes(status as PaymentStatus)) {
      throw new UnauthorizedException("Invalid development webhook payload");
    }
    return { providerEventId: value.eventId, eventType: value.type, providerPaymentId: value.providerPaymentId, status: status as PaymentStatus };
  }

  async requestRefund(_paymentProviderId: string, _amountMinor: number): Promise<RefundRequestResult> {
    // Explicitly no money movement in the development adapter.
    return { accepted: false };
  }
}
