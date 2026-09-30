import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment.provider";

type AppointmentPaymentFacts = {
  appointment_id: string;
  owner_user_id: string;
  status: string;
  amount_minor: number;
  currency: string;
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
      `select a.id appointment_id,p.owner_user_id,a.status,a.price_minor amount_minor,a.currency
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

  async processWebhook(signature: string | undefined, body: unknown) {
    const event = await this.provider.verifyWebhook(signature, body);
    const payloadSha256 = createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");

    const result = await this.db.tx(async (client) => {
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
      if (!inserted.rows[0]) return { duplicate: true, paymentId: payment.id };

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
    const { rows } = await this.db.query<PaymentRow & { owner_user_id: string }>(
      `select pay.*,p.owner_user_id
       from payments pay
       join appointments a on a.id=pay.appointment_id
       join patient_profiles p on p.id=a.patient_profile_id
       where pay.id=$1 and p.owner_user_id=$2`,
      [paymentId, user.id],
    );
    const payment = rows[0];
    if (!payment) throw new NotFoundException("Payment not found");
    if (!["paid","authorized","partially_refunded"].includes(payment.status)) {
      throw new ConflictException("Payment is not refundable");
    }

    const totals = await this.db.query<{ reserved: string }>(
      `select coalesce(sum(amount_minor),0)::text reserved
       from refunds where payment_id=$1 and status in ('requested','processing','succeeded')`,
      [paymentId],
    );
    const remaining = payment.amount_minor - Number(totals.rows[0]?.reserved ?? 0);
    if (amountMinor > remaining) throw new BadRequestException("Refund amount exceeds remaining refundable amount");

    const { rows: refunds } = await this.db.query<{ id: string; status: string }>(
      `insert into refunds(payment_id,status,amount_minor,reason_code,requested_by_user_id)
       values ($1,'requested',$2,$3,$4) returning id,status`,
      [paymentId, amountMinor, reasonCode ?? null, user.id],
    );

    const providerResult = payment.provider_payment_id
      ? await this.provider.requestRefund(payment.provider_payment_id, amountMinor)
      : { accepted: false };

    if (providerResult.accepted) {
      await this.db.query(
        `update refunds set status='processing',provider_refund_id=$2,updated_at=now() where id=$1`,
        [refunds[0].id, providerResult.providerRefundId ?? null],
      );
    }

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "payment.refund.request",
      resourceType: "payment",
      resourceId: paymentId,
      metadata: { refundId: refunds[0].id, amountMinor, providerAccepted: providerResult.accepted },
    });

    return {
      id: refunds[0].id,
      status: providerResult.accepted ? "processing" : "requested",
      amountMinor,
      requiresManualProviderAction: !providerResult.accepted,
    };
  }
}
