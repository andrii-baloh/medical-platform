import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { assertInvoiceSuccess, type CallbackValues } from "@robokassa/sdk";
import { DbService } from "../../db/db.service";
import type {
  CreatePaymentSessionInput,
  CreatePaymentSessionResult,
  PaymentProvider,
  RefundRequestResult,
  VerifiedPaymentEvent,
} from "../payment.provider";
import { robokassaClient } from "./robokassa-client";

function callbackValues(body: unknown): CallbackValues {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UnauthorizedException("Invalid Robokassa callback payload");
  }
  const result: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") result[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") result[key] = String(value);
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[key] = value;
  }
  return result;
}

@Injectable()
export class RobokassaPaymentProvider implements PaymentProvider {
  readonly name = "robokassa";

  constructor(private readonly db: DbService) {}

  async createSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult> {
    if (input.currency !== "RUB") throw new BadRequestException("Robokassa supports RUB payments only");

    const reference = await this.db.query<{ external_reference: string }>(
      `insert into payment_provider_references(payment_id,provider)
       values ($1,$2)
       on conflict (payment_id,provider)
       do update set payment_id=excluded.payment_id
       returning external_reference::text`,
      [input.paymentId, this.name],
    );
    const invId = Number(reference.rows[0]?.external_reference);
    if (!Number.isSafeInteger(invId) || invId <= 0) throw new Error("Unable to allocate Robokassa invoice reference");

    const service = await this.db.query<{ title: string }>(
      `select coalesce(so.title,'Медицинская онлайн-консультация') title
       from appointments a
       left join service_offers so on so.id=a.service_offer_id
       where a.id=$1`,
      [input.appointmentId],
    );
    const title = service.rows[0]?.title ?? "Медицинская онлайн-консультация";
    const amount = input.amountMinor / 100;
    const response = await robokassaClient().invoices.create({
      InvID: invId,
      OutSum: amount,
      Description: title,
      MerchantComments: `MedicalPlatform payment ${input.paymentId}`,
      InvoiceItems: [{
        Name: title,
        Quantity: 1,
        Cost: amount,
        Tax: process.env.ROBOKASSA_TAX ?? "none",
        PaymentMethod: process.env.ROBOKASSA_PAYMENT_METHOD ?? "full_prepayment",
        PaymentObject: process.env.ROBOKASSA_PAYMENT_OBJECT ?? "service",
      }],
      UserFields: { paymentId: input.paymentId, appointmentId: input.appointmentId },
    });
    assertInvoiceSuccess(response, "invoices.create");
    return { providerPaymentId: String(response.invId), providerSessionId: response.id, checkoutUrl: response.url };
  }

  async verifyWebhook(_signature: string | undefined, body: unknown): Promise<VerifiedPaymentEvent> {
    const notification = robokassaClient().notification.parseResultURL(callbackValues(body));
    robokassaClient().notification.verifyResultURL(notification);
    const invId = Number(notification.InvoiceID);
    const amountRub = Number(notification.OutSum);
    if (!Number.isSafeInteger(invId) || invId <= 0 || !Number.isFinite(amountRub) || amountRub <= 0) {
      throw new UnauthorizedException("Invalid Robokassa callback values");
    }

    const mapped = await this.db.query<{ amount_minor: number; currency: string }>(
      `select p.amount_minor,p.currency
       from payment_provider_references r
       join payments p on p.id=r.payment_id
       where r.provider=$1 and r.external_reference=$2`,
      [this.name, invId],
    );
    const payment = mapped.rows[0];
    if (!payment) throw new UnauthorizedException("Unknown Robokassa invoice");
    if (payment.currency !== "RUB" || Math.round(amountRub * 100) !== payment.amount_minor) {
      throw new UnauthorizedException("Robokassa callback amount mismatch");
    }
    return {
      providerEventId: `result:${notification.InvoiceID}:${notification.SignatureValue}`,
      eventType: "payment.paid",
      providerPaymentId: notification.InvoiceID,
      status: "paid",
    };
  }

  async requestRefund(paymentProviderId: string, amountMinor: number): Promise<RefundRequestResult> {
    const invoiceId = Number(paymentProviderId);
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new BadRequestException("Invalid Robokassa invoice id");
    const state = await robokassaClient().webService.opState(invoiceId);
    const opKey = state.Info?.OpKey;
    if (!opKey) return { accepted: false };
    const result = await robokassaClient().refunds.create({ OpKey: opKey, RefundSum: amountMinor / 100 });
    return { accepted: result.success, ...(result.requestId ? { providerRefundId: result.requestId } : {}) };
  }
}
