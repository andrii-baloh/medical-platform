import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";

function escapeLikePattern(input: string) {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireAdmin(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    if (!principal.roles.includes("admin")) throw new ForbiddenException("Admin role required");
    const { rows } = await this.db.query<{ ok: number }>(
      `select 1 ok from user_roles where user_id=$1 and role='admin'`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Admin role required");
    return user;
  }

  async dashboard(principal: Principal) {
    await this.requireAdmin(principal);
    const [users, doctors, appointments, payments] = await Promise.all([
      this.db.query<{ count: string }>(`select count(*)::text count from app_users where status='active'`),
      this.db.query<{ total: string; pending: string }>(
        `select count(*)::text total,
                count(*) filter (where verified=false)::text pending
         from doctor_profiles`,
      ),
      this.db.query<{ total: string; upcoming: string }>(
        `select count(*)::text total,
                count(*) filter (where status in ('confirmed','patient_checked_in','in_progress'))::text upcoming
         from appointments`,
      ),
      this.db.query<{ total: string; paid: string }>(
        `select count(*)::text total,
                count(*) filter (where status='paid')::text paid
         from payments`,
      ),
    ]);
    return {
      users: Number(users.rows[0]?.count ?? 0),
      doctors: {
        total: Number(doctors.rows[0]?.total ?? 0),
        pendingVerification: Number(doctors.rows[0]?.pending ?? 0),
      },
      appointments: {
        total: Number(appointments.rows[0]?.total ?? 0),
        active: Number(appointments.rows[0]?.upcoming ?? 0),
      },
      payments: {
        total: Number(payments.rows[0]?.total ?? 0),
        paid: Number(payments.rows[0]?.paid ?? 0),
      },
    };
  }

  async listDoctors(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select d.id,d.slug,d.full_name,d.verified,d.published,d.country_code,d.experience_years,
              d.price_minor,d.currency,d.created_at,
              u.email account_email,
              coalesce(sp.name_ru,'Специалист') specialty
       from doctor_profiles d
       left join app_users u on u.id=d.account_user_id
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties sp on sp.id=ds.specialty_id
       order by d.verified asc,d.created_at desc
       limit 200`,
    );
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      fullName: row.full_name,
      specialty: row.specialty,
      verified: row.verified,
      published: row.published,
      countryCode: row.country_code,
      experienceYears: row.experience_years,
      price: { amountMinor: row.price_minor, currency: row.currency },
      accountEmail: row.account_email,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async getDoctor(principal: Principal, doctorId: string) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select d.id,d.slug,d.full_name,d.about,d.experience_years,d.languages,d.patient_groups,
              d.verified,d.published,d.country_code,d.price_minor,d.currency,d.created_at,
              u.email account_email,
              coalesce(sp.name_ru,'Специалист') specialty
       from doctor_profiles d
       left join app_users u on u.id=d.account_user_id
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties sp on sp.id=ds.specialty_id
       where d.id=$1`,
      [doctorId],
    );
    if (!rows[0]) throw new NotFoundException("Doctor not found");
    const row = rows[0];
    return {
      id: row.id,
      slug: row.slug,
      fullName: row.full_name,
      about: row.about,
      specialty: row.specialty,
      experienceYears: row.experience_years,
      languages: row.languages,
      patientGroups: row.patient_groups,
      verified: row.verified,
      published: row.published,
      countryCode: row.country_code,
      price: { amountMinor: row.price_minor, currency: row.currency },
      accountEmail: row.account_email,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async updateDoctor(principal: Principal, doctorId: string, patch: { verified?: boolean; published?: boolean }) {
    const admin = await this.requireAdmin(principal);
    if (patch.verified === undefined && patch.published === undefined) {
      return this.getDoctor(principal, doctorId);
    }
    const { rows } = await this.db.query<{ id: string }>(
      `update doctor_profiles
       set verified=coalesce($2,verified),
           published=coalesce($3,published),
           updated_at=now()
       where id=$1 returning id`,
      [doctorId, patch.verified ?? null, patch.published ?? null],
    );
    if (!rows[0]) throw new NotFoundException("Doctor not found");
    await this.audit.record({
      actorUserId: admin.id,
      actorSubject: principal.sub,
      action: "admin.doctor.update",
      resourceType: "doctor",
      resourceId: doctorId,
      metadata: {
        ...(patch.verified !== undefined ? { verified: patch.verified } : {}),
        ...(patch.published !== undefined ? { published: patch.published } : {}),
      },
    });
    return this.getDoctor(principal, doctorId);
  }

  async listAppointments(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select a.id,a.status,a.price_minor,a.currency,a.patient_timezone,a.created_at,
              s.starts_at,s.ends_at,
              d.id doctor_id,d.full_name doctor_name,
              p.id patient_id,p.full_name patient_name
       from appointments a
       join appointment_slots s on s.id=a.slot_id
       join doctor_profiles d on d.id=a.doctor_id
       join patient_profiles p on p.id=a.patient_profile_id
       order by s.starts_at desc
       limit 250`,
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: new Date(row.ends_at).toISOString(),
      doctor: { id: row.doctor_id, fullName: row.doctor_name },
      patient: { id: row.patient_id, fullName: row.patient_name },
      price: { amountMinor: row.price_minor, currency: row.currency },
      patientTimezone: row.patient_timezone,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async listPayments(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select pay.id,pay.appointment_id,pay.provider,pay.status,pay.amount_minor,pay.currency,
              pay.created_at,pay.updated_at,pay.paid_at,
              d.full_name doctor_name,p.full_name patient_name
       from payments pay
       join appointments a on a.id=pay.appointment_id
       join doctor_profiles d on d.id=a.doctor_id
       join patient_profiles p on p.id=a.patient_profile_id
       order by pay.created_at desc
       limit 250`,
    );
    return rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      provider: row.provider,
      status: row.status,
      amountMinor: row.amount_minor,
      currency: row.currency,
      doctorName: row.doctor_name,
      patientName: row.patient_name,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    }));
  }

  async listNotificationDeliveries(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select d.id,d.notification_id,d.channel,d.status,d.provider,d.provider_message_id,
              d.attempts,d.sent_at,d.last_error_code,d.created_at,d.updated_at,
              n.type notification_type,u.email::text user_email
       from notification_deliveries d
       join notifications n on n.id=d.notification_id
       join app_users u on u.id=d.user_id
       order by d.created_at desc
       limit 250`,
    );
    return rows.map((row) => ({
      id: row.id,
      notificationId: row.notification_id,
      notificationType: row.notification_type,
      channel: row.channel,
      status: row.status,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      attempts: row.attempts,
      userEmail: row.user_email,
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      lastErrorCode: row.last_error_code,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async listAudit(principal: Principal, query?: string) {
    await this.requireAdmin(principal);
    const q = escapeLikePattern((query ?? "").trim());
    const { rows } = await this.db.query(
      `select id,occurred_at,actor_user_id,action,resource_type,resource_id,outcome,request_id,metadata
       from audit_events
       where ($1='' or action ilike '%' || $1 || '%' escape '\\' or resource_type ilike '%' || $1 || '%' escape '\\' or coalesce(resource_id,'') ilike '%' || $1 || '%' escape '\\')
       order by occurred_at desc
       limit 250`,
      [q],
    );
    return rows.map((row) => ({
      id: row.id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      actorUserId: row.actor_user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      outcome: row.outcome,
      requestId: row.request_id,
      metadata: row.metadata,
    }));
  }
}
