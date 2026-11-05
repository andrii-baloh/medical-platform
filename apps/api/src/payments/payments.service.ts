import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { PAYMENT_PROVIDER, type PaymentProvider, type VerifiedPaymentEvent } from "./payment.provider";

type AppointmentPaymentFacts = {
  appointment_id: string;
  owner_user_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  service_offer_id: string | null;
  patient_contract_id: string | null;
};

type PaymentRow = {
  id: string;
  appointment_id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_session_id: string | null;
  checkout_url: string | null;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: Date;
  updated_at: Date;
  paid_at: Date | null;
};

/**
 * Reject stale/out-of-order provider updates. Payment transitions are serialized
 * by SELECT ... FOR UPDATE in processWebhook.
 */
export function canAdvancePaymentStatus(current: string, next: string): boolean {
  const allowed: Record<string, readonly string[]> = {
    created: ["pending", "authorized", "paid", "failed", "cancelled"],
    pending: ["authorized", "paid", "failed", "cancelled"],
    authorized: ["paid", "failed", "cancelled"],
    paid: ["partially_refunded", "refunded"],
    partially_refunded: ["refunded"],
    refunded: [],
    failed: [],
    cancelled: [],
  };
  return Boolean(allowed[current]?.includes(next));
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  private async requireOwnedAppointment(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<AppointmentPaymentFacts>(
      `select a.id appointment_id,p.owner_user_id,a.status,a.price_minor amount_minor,a.currency,
              a.service_offer_id,a.patient_contract_id
       from appointments a
       join patient_profiles p on p.id=a.patient_profile_id
       where a.id=$1 and p.owner_user_id=$2`,
      [appointmentId, user.id],
    );
    if (!rows[0]) throw new NotFoundException("Appointment not found");
    return { user, appointment: rows[0] };
  }

  private mapPayment(row: PaymentRow, checkoutUrl: string | null = row.checkout_url ?? null) {
    return {
      id: row.id,
      appointmentId: row.appointment_id,
      provider: row.provider,
      status: row.status,
      amountMinor: row.amount_minor,
      currency: row.currency,
      checkoutUrl,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    };
  }

  async createSession(principal: Principal, appointmentId: string) {
    const { user, appointment } = await this.requireOwnedAppointment(principal, appointmentId);
    if (["cancelled_by_patient", "cancelled_by_doctor", "no_show"].includes(appointment.status)) {
      throw new ConflictException("Payment cannot be created for an inactive appointment");
    }
    if (!appointment.service_offer_id || !appointment.patient_contract_id) {
      throw new ConflictException("Commercial service terms and contract acceptance are required before payment");
    }
    const acceptedContract = await this.db.query(
      `select pc.id
       from patient_contracts pc
       where pc.id=$1 and pc.appointment_id=$2 and pc.service_offer_id=$3 and pc.status='accepted'
         and pc.price_minor=$4 and pc.currency=$5`,
      [appointment.patient_contract_id, appointmentId, appointment.service_offer_id, appointment.amount_minor, appointment.currency],
    );
    if (!acceptedContract.rows[0]) {
      throw new ConflictException("Accepted commercial contract does not match this appointment");
    }
    const payment = await this.db.tx(async (client) => {
      // Serialize payment-session creation per appointment. The unique partial
      // index remains the final database safety net, but callers no longer race
      // between a read outside the transaction and the insert.
      await client.query(`select id from appointments where id=$1 for update`, [appointmentId]);
      const existing = await client.query<PaymentRow>(
        `select * from payments
         where appointment_id=$1 and status in ('created','authorized','paid','partially_refunded')
         order by created_at desc limit 1`,
        [appointmentId],
      );
      if (existing.rows[0]) return existing.rows[0];
      const { rows } = await client.query<PaymentRow>(
        `insert into payments(appointment_id,provider,status,amount_minor,currency)
         values ($1,$2,'created',$3,$4)
         returning *`,
        [appointmentId, this.provider.name, appointment.amount_minor, appointment.currency],
      );
      return rows[0];
    });

    if (payment.provider_session_id) return this.mapPayment(payment);

    try {
      const session = await this.provider.createSession({
        paymentId: payment.id,
        appointmentId,
        amountMinor: payment.amount_minor,
        currency: payment.currency,
        customerReference: user.id,
      });
      const { rows } = await this.db.query<PaymentRow>(
        `update payments
         set provider_payment_id=$2,provider_session_id=$3,checkout_url=$4,updated_at=now()
         where id=$1 returning *`,
        [payment.id, session.providerPaymentId, session.providerSessionId, session.checkoutUrl],
      );
      await this.audit.record({
        actorUserId: user.id,
        actorSubject: principal.sub,
        action: "payment.session.create",
        resourceType: "payment",
        resourceId: payment.id,
        metadata: { appointmentId, provider: this.provider.name },
      });
      return this.mapPayment(rows[0], session.checkoutUrl);
    } catch (error) {
      await this.db.query(`update payments set status='failed',failed_at=now(),updated_at=now() where id=$1`, [payment.id]);
      throw error;
    }
  }

  async getForAppointment(principal: Principal, appointmentId: string) {
    await this.requireOwnedAppointment(principal, appointmentId);
    const { rows } = await this.db.query<PaymentRow>(
      `select * from payments where appointment_id=$1 order by created_at desc`,
      [appointmentId],
    );
    return rows.map((row) => this.mapPayment(row));
  }

  /**
   * Keeps the raw callback hash and its verification outcome. The normalised
   * `payment_events` stream stays the idempotency boundary; this table answers
   * "was this callback really received and was its signature valid" for
   * reconciliation and dispute review.
   */
  private async recordWebhook(input: {
    payloadSha256: string;
    signaturePresent: boolean;
    signatureValid: boolean;
    externalEventId?: string | null;
    status: "received" | "processed" | "duplicate" | "rejected" | "failed";
    errorCode?: string | null;
  }) {
    await this.db.query(
      `insert into payment_webhooks(provider,payload_sha256,signature_present,signature_valid,
                                    external_event_id,processing_status,error_code,processed_at)
       values ($1,$2,$3,$4,$5,$6,$7,
               case when $6 in ('processed','duplicate','rejected') then now() else null end)
       on conflict (provider,payload_sha256) do update
       set processing_status=case
             when payment_webhooks.processing_status in ('processed','duplicate')
              and excluded.processing_status='received'
             then payment_webhooks.processing_status
             else excluded.processing_status
           end,
           error_code=excluded.error_code,
           signature_valid=excluded.signature_valid,
           external_event_id=coalesce(excluded.external_event_id,payment_webhooks.external_event_id),
           processed_at=excluded.processed_at`,
      [
        this.provider.name,
        input.payloadSha256,
        input.signaturePresent,
        input.signatureValid,
        input.externalEventId ?? null,
        input.status,
        input.errorCode ?? null,
      ],
    );
  }

  async processWebhook(signature: string | undefined, body: unknown) {
    const payloadSha256 = createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
    // A verified callback carried a credential even when it lives in the body
    // (Robokassa `SignatureValue`) instead of a transport header, so this column
    // means "verification credential present", not "HTTP header present".
    let signaturePresent = Boolean(signature);

    let event: VerifiedPaymentEvent;
    try {
      event = await this.provider.verifyWebhook(signature, body);
      signaturePresent = true;
    } catch (error) {
      await this.recordWebhook({
        payloadSha256,
        signaturePresent,
        signatureValid: false,
        status: "rejected",
        errorCode: "webhook_verification_failed",
      }).catch(() => undefined);
      throw error;
    }

    await this.recordWebhook({
      payloadSha256,
      signaturePresent,
      signatureValid: true,
      externalEventId: event.providerEventId,
      status: "received",
    }).catch(() => undefined);

    let result: { duplicate: boolean; paymentId: string; status?: string };
    try {
      result = await this.db.tx(async (client) => {
        const paymentResult = await client.query<PaymentRow>(
          `select * from payments where provider=$1 and provider_payment_id=$2 for update`,
          [this.provider.name, event.providerPaymentId],
        );
        const payment = paymentResult.rows[0];
        if (!payment) throw new NotFoundException("Payment not found");

        const inserted = await client.query<{ id: string }>(
          `insert into payment_events(payment_id,provider,provider_event_id,event_type,payload_sha256)
           values ($1,$2,$3,$4,$5)
           on conflict (provider,provider_event_id) do nothing
           returning id`,
          [payment.id, this.provider.name, event.providerEventId, event.eventType, payloadSha256],
        );
        if (!inserted.rows[0]) return { duplicate: true, paymentId: payment.id, status: payment.status };

        if (!canAdvancePaymentStatus(payment.status, event.status)) {
          // Record the verified event, but don't reverse a settled or final
          // payment when a delayed or contradictory callback arrives.
          await client.query(
            "update payment_events set processing_status='processed',processed_at=now() where id=$1",
            [inserted.rows[0].id],
          );
          return { duplicate: true, paymentId: payment.id, status: payment.status };
        }

        await client.query(
          `update payments
           set status=$2,
               paid_at=case when $2='paid' then coalesce(paid_at,now()) else paid_at end,
               failed_at=case when $2='failed' then now() else failed_at end,
               updated_at=now()
           where id=$1`,
          [payment.id, event.status],
        );
        await client.query(
          `update payment_events set processing_status='processed',processed_at=now() where id=$1`,
          [inserted.rows[0].id],
        );
        await client.query(
          `insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
           values ('payment',$1,'payment.status_changed',$2::jsonb)`,
          [payment.id, JSON.stringify({ paymentId: payment.id, appointmentId: payment.appointment_id, status: event.status })],
        );
        return { duplicate: false, paymentId: payment.id, status: event.status };
      });
    } catch (error) {
      await this.recordWebhook({
        payloadSha256,
        signaturePresent,
        signatureValid: true,
        externalEventId: event.providerEventId,
        status: "failed",
        errorCode: "webhook_processing_failed",
      }).catch(() => undefined);
      throw error;
    }

    await this.recordWebhook({
      payloadSha256,
      signaturePresent,
      signatureValid: true,
      externalEventId: event.providerEventId,
      status: result.duplicate ? "duplicate" : "processed",
    }).catch(() => undefined);

    if (!result.duplicate) {
      await this.audit.record({
        action: "payment.webhook.process",
        resourceType: "payment",
        resourceId: result.paymentId,
        metadata: { provider: this.provider.name, status: result.status },
      });
    }
    return { ok: true, duplicate: result.duplicate };
  }

  async requestRefund(principal: Principal, paymentId: string, amountMinor: number, reasonCode?: string) {
    const user = await this.users.ensureAccount(principal);
    const { payment, refund } = await this.db.tx(async (client) => {
      const { rows } = await client.query<PaymentRow & { owner_user_id: string }>(
        `select pay.*,p.owner_user_id
         from payments pay
         join appointments a on a.id=pay.appointment_id
         join patient_profiles p on p.id=a.patient_profile_id
         where pay.id=$1 and p.owner_user_id=$2
         for update of pay`,
        [paymentId, user.id],
      );
      const lockedPayment = rows[0];
      if (!lockedPayment) throw new NotFoundException("Payment not found");
      if (!["paid","authorized","partially_refunded"].includes(lockedPayment.status)) {
        throw new ConflictException("Payment is not refundable");
      }

      const totals = await client.query<{ reserved: string }>(
        `select coalesce(sum(amount_minor),0)::text reserved
         from refunds where payment_id=$1 and status in ('requested','processing','succeeded')`,
        [paymentId],
      );
      const remaining = lockedPayment.amount_minor - Number(totals.rows[0]?.reserved ?? 0);
      if (amountMinor > remaining) throw new BadRequestException("Refund amount exceeds remaining refundable amount");

      const inserted = await client.query<{ id: string; status: string }>(
        `insert into refunds(payment_id,status,amount_minor,reason_code,requested_by_user_id)
         values ($1,'requested',$2,$3,$4) returning id,status`,
        [paymentId, amountMinor, reasonCode ?? null, user.id],
      );
      return { payment: lockedPayment, refund: inserted.rows[0] };
    });

    const providerResult = payment.provider_payment_id
      ? await this.provider.requestRefund(payment.provider_payment_id, amountMinor)
      : { accepted: false };

    if (providerResult.accepted) {
      await this.db.query(
        `update refunds set status='processing',provider_refund_id=$2,updated_at=now() where id=$1`,
        [refund.id, providerResult.providerRefundId ?? null],
      );
    }

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "payment.refund.request",
      resourceType: "payment",
      resourceId: paymentId,
      metadata: { refundId: refund.id, amountMinor, providerAccepted: providerResult.accepted },
    });

    return {
      id: refund.id,
      status: providerResult.accepted ? "processing" : "requested",
      amountMinor,
      requiresManualProviderAction: !providerResult.accepted,
    };
  }
}
