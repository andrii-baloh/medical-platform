import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PoolClient } from "pg";
import type { Principal } from "../../auth/principal";
import { DbService } from "../../db/db.service";
import { UsersService } from "../../users/users.service";
import type { FiscalReceiptKind } from "./fiscal-receipt.provider";

type FiscalReceiptRow = {
  id: string;
  payment_id: string;
  appointment_id: string;
  provider: string;
  receipt_type: FiscalReceiptKind;
  external_receipt_id: string | number;
  status: string;
  amount_minor: number;
  currency: string;
  attempts: number;
  last_error_code: string | null;
  fiscal_fn_number: string | null;
  fiscal_document_number: string | null;
  fiscal_document_attribute: string | null;
  fiscal_registered_at: Date | null;
  submitted_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class FiscalReceiptsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
  ) {}

  private map(row: FiscalReceiptRow) {
    return {
      id: row.id,
      paymentId: row.payment_id,
      appointmentId: row.appointment_id,
      provider: row.provider,
      receiptType: row.receipt_type,
      status: row.status,
      amountMinor: row.amount_minor,
      currency: row.currency,
      attempts: row.attempts,
      lastErrorCode: row.last_error_code,
      fiscal: row.fiscal_document_number
        ? {
            fnNumber: row.fiscal_fn_number,
            documentNumber: row.fiscal_document_number,
            documentAttribute: row.fiscal_document_attribute,
            registeredAt: row.fiscal_registered_at ? new Date(row.fiscal_registered_at).toISOString() : null,
          }
        : null,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Books the final (full-payment) receipt for a completed consultation.
   *
   * Runs inside the caller's transaction so "appointment completed" and
   * "receipt queued" either both persist or neither does. The unique
   * `(payment_id, receipt_type)` key makes the call idempotent.
   */
  async enqueueFinalReceipt(client: PoolClient, appointmentId: string): Promise<number> {
    const { rowCount } = await client.query(
      `insert into payment_fiscal_receipts(
         payment_id,appointment_id,provider,receipt_type,origin_external_reference,
         amount_minor,currency,status,payload_snapshot,client_email,client_phone)
       select p.id,p.appointment_id,r.provider,'full_payment',r.external_reference,
              p.amount_minor,p.currency,'pending',
              jsonb_build_object('paymentId',p.id,'appointmentId',p.appointment_id,
                                 'amountMinor',p.amount_minor,'currency',p.currency,
                                 'source','appointment.completed'),
              u.email::text,pp.phone
       from payments p
       join payment_provider_references r on r.payment_id=p.id and r.provider=p.provider
       join appointments a on a.id=p.appointment_id
       join patient_profiles pp on pp.id=a.patient_profile_id
       join app_users u on u.id=pp.owner_user_id
       where p.appointment_id=$1 and p.status='paid'
       on conflict (payment_id,receipt_type) do nothing`,
      [appointmentId],
    );
    return rowCount ?? 0;
  }

  /** Patient view: own receipts only, no other patient's fiscal data. */
  async listForAppointment(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const owned = await this.db.query<{ ok: number }>(
      `select 1 ok
       from appointments a
       join patient_profiles p on p.id=a.patient_profile_id
       where a.id=$1 and p.owner_user_id=$2`,
      [appointmentId, user.id],
    );
    if (!owned.rows[0]) throw new NotFoundException("Appointment not found");
    return this.listByAppointmentId(appointmentId);
  }

  async listByAppointmentId(appointmentId: string) {
    const { rows } = await this.db.query<FiscalReceiptRow>(
      `select id,payment_id,appointment_id,provider,receipt_type,external_receipt_id,status,
              amount_minor,currency,attempts,last_error_code,fiscal_fn_number,fiscal_document_number,
              fiscal_document_attribute,fiscal_registered_at,submitted_at,confirmed_at,created_at,updated_at
       from payment_fiscal_receipts
       where appointment_id=$1
       order by created_at`,
      [appointmentId],
    );
    return rows.map((row) => this.map(row));
  }

  async listForAdmin(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    if (!principal.roles.includes("admin")) throw new ForbiddenException("Admin role required");
    const { rows: roles } = await this.db.query<{ ok: number }>(
      `select 1 ok from user_roles where user_id=$1 and role='admin'`,
      [user.id],
    );
    if (!roles[0]) throw new ForbiddenException("Admin role required");

    const { rows } = await this.db.query<FiscalReceiptRow & { patient_name: string | null; doctor_name: string | null }>(
      `select r.id,r.payment_id,r.appointment_id,r.provider,r.receipt_type,r.external_receipt_id,r.status,
              r.amount_minor,r.currency,r.attempts,r.last_error_code,r.fiscal_fn_number,r.fiscal_document_number,
              r.fiscal_document_attribute,r.fiscal_registered_at,r.submitted_at,r.confirmed_at,r.created_at,r.updated_at,
              p.full_name patient_name,d.full_name doctor_name
       from payment_fiscal_receipts r
       join appointments a on a.id=r.appointment_id
       join patient_profiles p on p.id=a.patient_profile_id
       join doctor_profiles d on d.id=a.doctor_id
       order by r.created_at desc
       limit 250`,
    );
    return rows.map((row) => ({
      ...this.map(row),
      patientName: row.patient_name,
      doctorName: row.doctor_name,
    }));
  }
}
