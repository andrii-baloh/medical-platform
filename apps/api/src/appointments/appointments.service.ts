import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type { Principal } from "../auth/principal";
import type { BookAppointmentDto } from "./appointment.dto";

@Injectable()
export class AppointmentsService {
  constructor(private readonly db: DbService, private readonly users: UsersService) {}

  async list(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select a.id,a.status,a.reason,a.patient_timezone,a.price_minor,a.currency,
              s.starts_at,s.ends_at,
              p.id patient_id,p.full_name patient_name,p.birth_date,p.relation_to_owner,
              d.id doctor_id,d.slug,d.full_name doctor_name,
              coalesce(sp.name_ru,'РЎРїРµС†РёР°Р»РёСЃС‚') specialty
       from appointments a
       join appointment_slots s on s.id=a.slot_id
       join patient_profiles p on p.id=a.patient_profile_id
       join doctor_profiles d on d.id=a.doctor_id
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties sp on sp.id=ds.specialty_id
       where p.owner_user_id=$1
       order by s.starts_at desc`,
      [user.id],
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      doctor: { id: r.doctor_id, slug: r.slug, fullName: r.doctor_name, specialty: r.specialty },
      patient: { id: r.patient_id, fullName: r.patient_name, birthDate: r.birth_date, relationToOwner: r.relation_to_owner },
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      patientTimezone: r.patient_timezone,
      price: { amountMinor: r.price_minor, currency: r.currency },
      reason: r.reason,
    }));
  }

  async get(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select a.id,a.status,a.reason,a.patient_timezone,a.price_minor,a.currency,
              s.starts_at,s.ends_at,
              p.id patient_id,p.full_name patient_name,p.birth_date,p.relation_to_owner,
              d.id doctor_id,d.slug,d.full_name doctor_name,
              coalesce(sp.name_ru,'РЎРїРµС†РёР°Р»РёСЃС‚') specialty
       from appointments a
       join appointment_slots s on s.id=a.slot_id
       join patient_profiles p on p.id=a.patient_profile_id
       join doctor_profiles d on d.id=a.doctor_id
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties sp on sp.id=ds.specialty_id
       where a.id=$1 and p.owner_user_id=$2`,
      [appointmentId, user.id],
    );
    const r = rows[0];
    if (!r) throw new NotFoundException("Appointment not found");
    return {
      id: r.id,
      status: r.status,
      doctor: { id: r.doctor_id, slug: r.slug, fullName: r.doctor_name, specialty: r.specialty },
      patient: { id: r.patient_id, fullName: r.patient_name, birthDate: r.birth_date, relationToOwner: r.relation_to_owner },
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      patientTimezone: r.patient_timezone,
      price: { amountMinor: r.price_minor, currency: r.currency },
      reason: r.reason,
    };
  }

  async book(principal: Principal, input: BookAppointmentDto, idempotencyKey?: string) {
    const user = await this.users.ensureAccount(principal);
    return this.db.tx(async (client) => {
      if (idempotencyKey) {
        const cached = await client.query(
          `select response_status,response_body from idempotency_keys
           where key=$1 and user_id=$2 and operation='book_appointment' and expires_at>now()`,
          [idempotencyKey, user.id],
        );
        if (cached.rows[0]?.response_body) return cached.rows[0].response_body;
      }

      const patient = await client.query(
        `select id from patient_profiles where id=$1 and owner_user_id=$2 and archived_at is null`,
        [input.patientProfileId, user.id],
      );
      if (!patient.rows[0]) throw new ForbiddenException("Patient profile is not owned by current user");

      const slotResult = await client.query(
        `update appointment_slots
         set status='booked',updated_at=now()
         where id=$1 and status='available' and starts_at>now()
         returning id,doctor_id,starts_at,ends_at,price_minor,currency`,
        [input.slotId],
      );
      const slot = slotResult.rows[0];
      if (!slot) throw new ConflictException("This time slot is no longer available");

      const appointmentResult = await client.query(
        `insert into appointments(
           slot_id,doctor_id,patient_profile_id,created_by_user_id,status,reason,patient_timezone,price_minor,currency
         ) values ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8)
         returning id,status,created_at`,
        [slot.id, slot.doctor_id, input.patientProfileId, user.id, input.reason || null, input.timezone, slot.price_minor, slot.currency],
      );
      const appointment = appointmentResult.rows[0];
      await client.query(
        `insert into appointment_status_history(appointment_id,from_status,to_status,changed_by_user_id)
         values ($1,null,'confirmed',$2)`,
        [appointment.id, user.id],
      );
      await client.query(
        `insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id,metadata)
         values ($1,$2,'appointment.book','appointment',$3,$4::jsonb)`,
        [user.id, principal.sub, appointment.id, JSON.stringify({ slotId: slot.id })],
      );
      await client.query(
        `insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
         values ('appointment',$1,'appointment.confirmed',$2::jsonb)`,
        [appointment.id, JSON.stringify({ appointmentId: appointment.id })],
      );

      const response = {
        id: appointment.id,
        status: appointment.status,
        startsAt: new Date(slot.starts_at).toISOString(),
        endsAt: new Date(slot.ends_at).toISOString(),
        price: { amountMinor: slot.price_minor, currency: slot.currency },
      };
      if (idempotencyKey) {
        await client.query(
          `insert into idempotency_keys(key,user_id,operation,response_status,response_body,expires_at)
           values ($1,$2,'book_appointment',201,$3::jsonb,now()+interval '24 hours')
           on conflict (key) do nothing`,
          [idempotencyKey, user.id, JSON.stringify(response)],
        );
      }
      return response;
    });
  }

  async cancel(principal: Principal, appointmentId: string, reason: string) {
    const user = await this.users.ensureAccount(principal);
    return this.db.tx(async (client) => {
      const found = await client.query(
        `select a.id,a.slot_id,a.status,s.starts_at
         from appointments a
         join patient_profiles p on p.id=a.patient_profile_id
         join appointment_slots s on s.id=a.slot_id
         where a.id=$1 and p.owner_user_id=$2
         for update of a`,
        [appointmentId, user.id],
      );
      const appt = found.rows[0];
      if (!appt) throw new NotFoundException("Appointment not found");
      if (!["confirmed","patient_checked_in"].includes(appt.status)) {
        throw new ConflictException("Appointment can no longer be cancelled by the patient");
      }
      await client.query(
        `update appointments set status='cancelled_by_patient',cancelled_at=now(),cancellation_reason=$2,updated_at=now() where id=$1`,
        [appointmentId, reason || null],
      );
      await client.query(
        `update medical_encounters set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now()
         where appointment_id=$1 and status not in ('completed','requires_offline_visit')`,
        [appointmentId],
      );
      await client.query(
        `insert into appointment_status_history(appointment_id,from_status,to_status,changed_by_user_id,reason)
         values ($1,$2,'cancelled_by_patient',$3,$4)`,
        [appointmentId, appt.status, user.id, reason || null],
      );
      if (new Date(appt.starts_at).getTime() > Date.now()) {
        await client.query(`update appointment_slots set status='available',updated_at=now() where id=$1`, [appt.slot_id]);
      }
      await client.query(
        `insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id)
         values ($1,$2,'appointment.cancel.patient','appointment',$3)`,
        [user.id, principal.sub, appointmentId],
      );
      await client.query(
        `insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
         values ('appointment',$1,'appointment.cancelled',$2::jsonb)`,
        [appointmentId, JSON.stringify({ appointmentId, by: "patient" })],
      );
      return { id: appointmentId, status: "cancelled_by_patient" };
    });
  }
}
