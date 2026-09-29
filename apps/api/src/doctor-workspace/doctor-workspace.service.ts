import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import type { ConsultationDraftDto, CreateDoctorSlotsDto, SetWorkingHoursDto } from "./doctor-workspace.dto";

@Injectable()
export class DoctorWorkspaceService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireDoctor(principal: Principal) {
    if (!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role is required");
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select d.*,u.timezone account_timezone,u.locale account_locale
       from doctor_profiles d
       join app_users u on u.id=d.account_user_id
       join user_roles r on r.user_id=u.id and r.role='doctor'
       where d.account_user_id=$1 and d.verified=true
       limit 1`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Verified doctor profile is not linked to this account");
    return { user, doctor: rows[0] };
  }

  async me(principal: Principal) {
    const { user, doctor } = await this.requireDoctor(principal);
    return {
      userId: user.id,
      doctorId: doctor.id,
      slug: doctor.slug,
      fullName: doctor.full_name,
      initials: doctor.initials,
      about: doctor.about,
      verified: doctor.verified,
      published: doctor.published,
      timezone: doctor.account_timezone,
      locale: doctor.account_locale,
      price: { amountMinor: doctor.price_minor, currency: doctor.currency },
    };
  }

  async dashboard(principal: Principal) {
    const { user, doctor } = await this.requireDoctor(principal);
    const timezone = user.timezone || "UTC";
    const { rows: appointments } = await this.db.query(
      `select a.id,a.status,a.reason,s.starts_at,s.ends_at,p.id patient_id,p.full_name patient_name,p.birth_date
       from appointments a
       join appointment_slots s on s.id=a.slot_id
       join patient_profiles p on p.id=a.patient_profile_id
       where a.doctor_id=$1
         and (s.starts_at at time zone $2)::date=(now() at time zone $2)::date
       order by s.starts_at`,
      [doctor.id, timezone],
    );
    const { rows: metrics } = await this.db.query(
      `select
         count(*) filter (where a.status='completed' and s.starts_at >= date_trunc('month',now()))::int completed_month,
         count(*) filter (where a.status in ('confirmed','patient_checked_in') and s.starts_at > now())::int upcoming,
         count(distinct a.patient_profile_id)::int patients_total
       from appointments a join appointment_slots s on s.id=a.slot_id where a.doctor_id=$1`,
      [doctor.id],
    );
    return {
      doctor: { id: doctor.id, fullName: doctor.full_name, initials: doctor.initials, timezone },
      metrics: metrics[0] ?? { completed_month: 0, upcoming: 0, patients_total: 0 },
      today: appointments.map(mapDoctorAppointment),
    };
  }

  async appointments(principal: Principal, from?: string, to?: string) {
    const { doctor } = await this.requireDoctor(principal);
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to) : new Date(Date.now() + 31 * 86400000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
      throw new UnprocessableEntityException("Invalid date range");
    }
    const { rows } = await this.db.query(
      `select a.id,a.status,a.reason,a.patient_timezone,a.price_minor,a.currency,
              s.starts_at,s.ends_at,p.id patient_id,p.full_name patient_name,p.birth_date
       from appointments a
       join appointment_slots s on s.id=a.slot_id
       join patient_profiles p on p.id=a.patient_profile_id
       where a.doctor_id=$1 and s.starts_at >= $2 and s.starts_at < $3
       order by s.starts_at`,
      [doctor.id, fromDate, toDate],
    );
    return rows.map(mapDoctorAppointment);
  }

  async appointment(principal: Principal, appointmentId: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `select a.id,a.status,a.reason,a.patient_timezone,a.price_minor,a.currency,
              s.starts_at,s.ends_at,p.id patient_id,p.full_name patient_name,p.birth_date,p.sex,p.relation_to_owner,
              c.id consultation_id,c.complaints,c.anamnesis,c.assessment,c.recommendations,c.signed_at,c.version
       from appointments a
       join appointment_slots s on s.id=a.slot_id
       join patient_profiles p on p.id=a.patient_profile_id
       left join consultations c on c.appointment_id=a.id
       where a.id=$1 and a.doctor_id=$2`,
      [appointmentId, doctor.id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Appointment not found");
    const { rows: docs } = await this.db.query(
      `select md.id,md.original_name,md.mime_type,md.size_bytes,md.category,md.created_at
       from medical_documents md
       join document_grants g on g.document_id=md.id
       where md.patient_profile_id=$1 and md.status='active' and g.doctor_id=$2
         and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())
       order by md.created_at desc`,
      [row.patient_id, doctor.id],
    );
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "doctor.appointment.view", resourceType: "appointment", resourceId: appointmentId });
    return {
      ...mapDoctorAppointment(row),
      patient: {
        id: row.patient_id,
        fullName: row.patient_name,
        birthDate: row.birth_date,
        sex: row.sex,
        relationToOwner: row.relation_to_owner,
      },
      consultation: row.consultation_id ? {
        id: row.consultation_id,
        version: row.version,
        complaints: row.complaints,
        anamnesis: row.anamnesis,
        assessment: row.assessment,
        recommendations: row.recommendations,
        signedAt: row.signed_at ? new Date(row.signed_at).toISOString() : null,
      } : null,
      documents: docs.map((d) => ({
        id: d.id,
        originalName: d.original_name,
        mimeType: d.mime_type,
        sizeBytes: Number(d.size_bytes),
        category: d.category,
        createdAt: new Date(d.created_at).toISOString(),
      })),
    };
  }

  async patients(principal: Principal) {
    const { doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `select p.id,p.full_name,p.birth_date,p.sex,
              count(a.id)::int appointment_count,
              max(s.starts_at) filter (where s.starts_at<=now()) last_appointment,
              min(s.starts_at) filter (where s.starts_at>now() and a.status in ('confirmed','patient_checked_in')) next_appointment
       from patient_profiles p
       join appointments a on a.patient_profile_id=p.id
       join appointment_slots s on s.id=a.slot_id
       where a.doctor_id=$1
       group by p.id,p.full_name,p.birth_date,p.sex
       order by coalesce(max(s.starts_at),'-infinity'::timestamptz) desc`,
      [doctor.id],
    );
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      birthDate: r.birth_date,
      sex: r.sex,
      appointmentCount: r.appointment_count,
      lastAppointment: r.last_appointment ? new Date(r.last_appointment).toISOString() : null,
      nextAppointment: r.next_appointment ? new Date(r.next_appointment).toISOString() : null,
    }));
  }

  async patient(principal: Principal, patientId: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `select p.id,p.full_name,p.birth_date,p.sex,p.relation_to_owner
       from patient_profiles p
       where p.id=$1 and exists(select 1 from appointments a where a.patient_profile_id=p.id and a.doctor_id=$2)`,
      [patientId, doctor.id],
    );
    const patient = rows[0];
    if (!patient) throw new NotFoundException("Patient not found");
    const { rows: appointments } = await this.db.query(
      `select a.id,a.status,a.reason,s.starts_at,s.ends_at
       from appointments a join appointment_slots s on s.id=a.slot_id
       where a.patient_profile_id=$1 and a.doctor_id=$2 order by s.starts_at desc`,
      [patientId, doctor.id],
    );
    const { rows: documents } = await this.db.query(
      `select md.id,md.original_name,md.mime_type,md.size_bytes,md.category,md.created_at
       from medical_documents md join document_grants g on g.document_id=md.id
       where md.patient_profile_id=$1 and md.status='active' and g.doctor_id=$2
         and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())
       order by md.created_at desc`,
      [patientId, doctor.id],
    );
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "doctor.patient.view", resourceType: "patient_profile", resourceId: patientId });
    return {
      id: patient.id,
      fullName: patient.full_name,
      birthDate: patient.birth_date,
      sex: patient.sex,
      relationToOwner: patient.relation_to_owner,
      appointments: appointments.map((a) => ({ ...a, startsAt: new Date(a.starts_at).toISOString(), endsAt: new Date(a.ends_at).toISOString() })),
      documents: documents.map((d) => ({ id: d.id, originalName: d.original_name, mimeType: d.mime_type, sizeBytes: Number(d.size_bytes), category: d.category, createdAt: new Date(d.created_at).toISOString() })),
    };
  }

  async startAppointment(principal: Principal, appointmentId: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        `select a.*,s.starts_at from appointments a join appointment_slots s on s.id=a.slot_id
         where a.id=$1 and a.doctor_id=$2 for update of a`,
        [appointmentId, doctor.id],
      );
      const appointment = rows[0];
      if (!appointment) throw new NotFoundException("Appointment not found");
      if (!["confirmed","patient_checked_in","in_progress"].includes(appointment.status)) throw new ConflictException("Appointment cannot be started");
      if (new Date(appointment.starts_at).getTime() - Date.now() > 30 * 60 * 1000) throw new ConflictException("Consultation can be started only 30 minutes before the scheduled time");
      if (appointment.status !== "in_progress") {
        await client.query(`update appointments set status='in_progress',updated_at=now() where id=$1`, [appointmentId]);
        await client.query(
          `insert into appointment_status_history(appointment_id,from_status,to_status,changed_by_user_id)
           values ($1,$2,'in_progress',$3)`,
          [appointmentId, appointment.status, user.id],
        );
      }
      const consultation = await client.query(
        `insert into consultations(appointment_id,started_at) values ($1,now())
         on conflict (appointment_id) do update set started_at=coalesce(consultations.started_at,excluded.started_at)
         returning *`,
        [appointmentId],
      );
      await client.query(
        `insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id)
         values ($1,$2,'consultation.start','appointment',$3)`,
        [user.id, principal.sub, appointmentId],
      );
      return { appointmentId, status: "in_progress", consultationId: consultation.rows[0].id };
    });
  }

  async updateDraft(principal: Principal, appointmentId: string, input: ConsultationDraftDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    const relation = await this.db.query(`select status from appointments where id=$1 and doctor_id=$2`, [appointmentId, doctor.id]);
    if (!relation.rows[0]) throw new NotFoundException("Appointment not found");
    if (["cancelled_by_patient","cancelled_by_doctor","no_show"].includes(relation.rows[0].status)) throw new ConflictException("Consultation is closed");
    const existing = await this.db.query(`select * from consultations where appointment_id=$1`, [appointmentId]);
    if (existing.rows[0]?.signed_at) throw new ConflictException("Signed version is immutable. Start an amendment first.");
    const { rows } = await this.db.query(
      `insert into consultations(appointment_id,complaints,anamnesis,assessment,recommendations,started_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (appointment_id) do update set
         complaints=excluded.complaints,anamnesis=excluded.anamnesis,assessment=excluded.assessment,
         recommendations=excluded.recommendations,updated_at=now()
       returning *`,
      [appointmentId, input.complaints ?? null, input.anamnesis ?? null, input.assessment ?? null, input.recommendations ?? null],
    );
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "consultation.draft.update", resourceType: "appointment", resourceId: appointmentId, metadata: { version: rows[0].version } });
    return mapConsultation(rows[0]);
  }

  async sign(principal: Principal, appointmentId: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    return this.db.tx(async (client) => {
      const relation = await client.query(`select id,status from appointments where id=$1 and doctor_id=$2 for update`, [appointmentId, doctor.id]);
      if (!relation.rows[0]) throw new NotFoundException("Appointment not found");
      const result = await client.query(`select * from consultations where appointment_id=$1 for update`, [appointmentId]);
      const consultation = result.rows[0];
      if (!consultation) throw new ConflictException("Consultation draft does not exist");
      if (!["in_progress","completed"].includes(relation.rows[0].status)) throw new ConflictException("Clinical conclusion can be signed only for an active or completed consultation");
      if (consultation.signed_at) {
        const existing = await client.query(
          `select content_sha256,signed_at from consultation_versions where consultation_id=$1 and version_no=$2`,
          [consultation.id, consultation.version],
        );
        if (existing.rows[0]) return {
          appointmentId, consultationId: consultation.id, version: consultation.version,
          signedAt: new Date(existing.rows[0].signed_at).toISOString(), contentSha256: existing.rows[0].content_sha256,
        };
        throw new ConflictException("Consultation is marked signed but its immutable version is missing");
      }
      const snapshot = {
        appointmentId,
        version: consultation.version,
        complaints: consultation.complaints ?? "",
        anamnesis: consultation.anamnesis ?? "",
        assessment: consultation.assessment ?? "",
        recommendations: consultation.recommendations ?? "",
      };
      if (![snapshot.complaints, snapshot.assessment, snapshot.recommendations].some((v) => v.trim().length > 0)) {
        throw new UnprocessableEntityException("Clinical conclusion is empty");
      }
      const previous = await client.query(
        `select content_sha256 from consultation_versions where consultation_id=$1 order by version_no desc limit 1`,
        [consultation.id],
      );
      const previousHash = previous.rows[0]?.content_sha256 ?? null;
      const canonical = JSON.stringify({ ...snapshot, previousVersionSha256: previousHash });
      const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
      const signedAt = new Date();
      await client.query(
        `insert into consultation_versions(
           consultation_id,appointment_id,version_no,snapshot,content_sha256,previous_version_sha256,signed_at,signed_by_user_id
         ) values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
        [consultation.id, appointmentId, consultation.version, JSON.stringify(snapshot), hash, previousHash, signedAt, user.id],
      );
      await client.query(
        `update consultations set signed_at=$2,signed_by_user_id=$3,updated_at=now() where id=$1`,
        [consultation.id, signedAt, user.id],
      );
      await client.query(
        `insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id,metadata)
         values ($1,$2,'consultation.sign','consultation',$3,$4::jsonb)`,
        [user.id, principal.sub, consultation.id, JSON.stringify({ appointmentId, version: consultation.version, contentSha256: hash })],
      );
      await client.query(
        `insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
         values ('appointment',$1,'consultation.signed',$2::jsonb)`,
        [appointmentId, JSON.stringify({ appointmentId, consultationId: consultation.id, version: consultation.version })],
      );
      return { appointmentId, consultationId: consultation.id, version: consultation.version, signedAt: signedAt.toISOString(), contentSha256: hash };
    });
  }

  async startAmendment(principal: Principal, appointmentId: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `update consultations c set version=version+1,signed_at=null,signed_by_user_id=null,updated_at=now()
       from appointments a
       where c.appointment_id=$1 and a.id=c.appointment_id and a.doctor_id=$2 and c.signed_at is not null
       returning c.*`,
      [appointmentId, doctor.id],
    );
    if (!rows[0]) throw new ConflictException("A signed version is required before an amendment can be started");
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "consultation.amendment.start", resourceType: "consultation", resourceId: rows[0].id, metadata: { version: rows[0].version } });
    return mapConsultation(rows[0]);
  }

  async versions(principal: Principal, appointmentId: string) {
    const { doctor } = await this.requireDoctor(principal);
    const relation = await this.db.query(`select 1 from appointments where id=$1 and doctor_id=$2`, [appointmentId, doctor.id]);
    if (!relation.rowCount) throw new NotFoundException("Appointment not found");
    const { rows } = await this.db.query(
      `select version_no,snapshot,content_sha256,previous_version_sha256,signed_at,signature_method
       from consultation_versions where appointment_id=$1 order by version_no desc`,
      [appointmentId],
    );
    return rows.map((r) => ({
      version: r.version_no,
      snapshot: r.snapshot,
      contentSha256: r.content_sha256,
      previousVersionSha256: r.previous_version_sha256,
      signedAt: new Date(r.signed_at).toISOString(),
      signatureMethod: r.signature_method,
    }));
  }

  async completeAppointment(principal: Principal, appointmentId: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    return this.db.tx(async (client) => {
      const result = await client.query(
        `select a.status,c.id consultation_id,c.signed_at
         from appointments a left join consultations c on c.appointment_id=a.id
         where a.id=$1 and a.doctor_id=$2 for update of a`,
        [appointmentId, doctor.id],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Appointment not found");
      if (!row.signed_at) throw new ConflictException("Sign the current medical conclusion before completing the appointment");
      if (row.status === "completed") return { id: appointmentId, status: "completed" };
      if (row.status !== "in_progress") throw new ConflictException("Only an active consultation can be completed");
      await client.query(`update appointments set status='completed',updated_at=now() where id=$1`, [appointmentId]);
      await client.query(`update consultations set ended_at=coalesce(ended_at,now()),updated_at=now() where appointment_id=$1`, [appointmentId]);
      await client.query(
        `insert into appointment_status_history(appointment_id,from_status,to_status,changed_by_user_id) values ($1,$2,'completed',$3)`,
        [appointmentId, row.status, user.id],
      );
      await client.query(
        `insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id) values ($1,$2,'appointment.complete','appointment',$3)`,
        [user.id, principal.sub, appointmentId],
      );
      await client.query(
        `insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values ('appointment',$1,'appointment.completed',$2::jsonb)`,
        [appointmentId, JSON.stringify({ appointmentId })],
      );
      return { id: appointmentId, status: "completed" };
    });
  }

  async cancelAppointment(principal: Principal, appointmentId: string, reason?: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    return this.db.tx(async (client) => {
      const result = await client.query(
        `select a.id,a.slot_id,a.status,s.starts_at from appointments a join appointment_slots s on s.id=a.slot_id
         where a.id=$1 and a.doctor_id=$2 for update of a`,
        [appointmentId, doctor.id],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Appointment not found");
      if (!["confirmed","patient_checked_in"].includes(row.status)) throw new ConflictException("Appointment can no longer be cancelled");
      await client.query(`update appointments set status='cancelled_by_doctor',cancelled_at=now(),cancellation_reason=$2,updated_at=now() where id=$1`, [appointmentId, reason ?? null]);
      if (new Date(row.starts_at).getTime() > Date.now()) await client.query(`update appointment_slots set status='available',updated_at=now() where id=$1`, [row.slot_id]);
      await client.query(`insert into appointment_status_history(appointment_id,from_status,to_status,changed_by_user_id,reason) values ($1,$2,'cancelled_by_doctor',$3,$4)`, [appointmentId, row.status, user.id, reason ?? null]);
      await client.query(`insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id) values ($1,$2,'appointment.cancel.doctor','appointment',$3)`, [user.id, principal.sub, appointmentId]);
      await client.query(`insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values ('appointment',$1,'appointment.cancelled',$2::jsonb)`, [appointmentId, JSON.stringify({ appointmentId, by: "doctor" })]);
      return { id: appointmentId, status: "cancelled_by_doctor" };
    });
  }

  async workingHours(principal: Principal) {
    const { doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `select id,weekday,to_char(local_start,'HH24:MI') start,to_char(local_end,'HH24:MI') "end",timezone,active
       from doctor_working_hours where doctor_id=$1 order by weekday,local_start`,
      [doctor.id],
    );
    return rows;
  }

  async setWorkingHours(principal: Principal, input: SetWorkingHoursDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    await this.db.tx(async (client) => {
      await client.query(`delete from doctor_working_hours where doctor_id=$1`, [doctor.id]);
      for (const h of input.hours) {
        if (h.end <= h.start) throw new UnprocessableEntityException("Working hour end must be after start");
        await client.query(
          `insert into doctor_working_hours(doctor_id,weekday,local_start,local_end,timezone) values ($1,$2,$3::time,$4::time,$5)`,
          [doctor.id, h.weekday, h.start, h.end, h.timezone],
        );
      }
    });
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "doctor.working_hours.replace", resourceType: "doctor_profile", resourceId: doctor.id, metadata: { count: input.hours.length } });
    return this.workingHours(principal);
  }

  async slots(principal: Principal, from?: string, to?: string) {
    const { doctor } = await this.requireDoctor(principal);
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 31 * 86400000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) throw new UnprocessableEntityException("Invalid date range");
    const { rows } = await this.db.query(
      `select s.id,s.starts_at,s.ends_at,s.status,s.price_minor,s.currency,a.id appointment_id,a.status appointment_status,p.full_name patient_name
       from appointment_slots s
       left join appointments a on a.slot_id=s.id and a.status not in ('cancelled_by_patient','cancelled_by_doctor')
       left join patient_profiles p on p.id=a.patient_profile_id
       where s.doctor_id=$1 and s.starts_at >= $2 and s.starts_at < $3
       order by s.starts_at`,
      [doctor.id, fromDate, toDate],
    );
    return rows.map((r) => ({
      id: r.id,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      status: r.status,
      price: { amountMinor: r.price_minor, currency: r.currency },
      appointment: r.appointment_id ? { id: r.appointment_id, status: r.appointment_status, patientName: r.patient_name } : null,
    }));
  }

  async createSlots(principal: Principal, input: CreateDoctorSlotsDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    const normalized = input.slots.map((s) => ({ startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) }));
    for (const slot of normalized) {
      if (Number.isNaN(slot.startsAt.getTime()) || Number.isNaN(slot.endsAt.getTime()) || slot.endsAt <= slot.startsAt) throw new UnprocessableEntityException("Invalid slot");
      if (slot.startsAt.getTime() <= Date.now()) throw new UnprocessableEntityException("Slots must be in the future");
      if (slot.endsAt.getTime() - slot.startsAt.getTime() > 4 * 60 * 60 * 1000) throw new UnprocessableEntityException("Slot is too long");
    }
    const created: any[] = [];
    try {
      await this.db.tx(async (client) => {
        for (const slot of normalized) {
          const result = await client.query(
            `insert into appointment_slots(doctor_id,starts_at,ends_at,status,price_minor,currency)
             values ($1,$2,$3,'available',$4,$5)
             on conflict (doctor_id,starts_at) do nothing returning *`,
            [doctor.id, slot.startsAt, slot.endsAt, doctor.price_minor, doctor.currency],
          );
          if (result.rows[0]) created.push(result.rows[0]);
        }
      });
    } catch (error: any) {
      if (error?.code === "23P01" || error?.code === "23505") throw new ConflictException("A slot overlaps an existing time interval");
      throw error;
    }
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "doctor.slots.create", resourceType: "doctor_profile", resourceId: doctor.id, metadata: { requested: input.slots.length, created: created.length } });
    return created.map((r) => ({ id: r.id, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(), status: r.status }));
  }

  async setSlotBlocked(principal: Principal, slotId: string, blocked: boolean) {
    const { user, doctor } = await this.requireDoctor(principal);
    const desired = blocked ? "blocked" : "available";
    const allowedCurrent = blocked ? "available" : "blocked";
    const { rows } = await this.db.query(
      `update appointment_slots set status=$3,updated_at=now()
       where id=$1 and doctor_id=$2 and status=$4 and starts_at>now() returning *`,
      [slotId, doctor.id, desired, allowedCurrent],
    );
    if (!rows[0]) throw new ConflictException("Slot cannot be changed");
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: blocked ? "doctor.slot.block" : "doctor.slot.unblock", resourceType: "appointment_slot", resourceId: slotId });
    return { id: slotId, status: desired };
  }
}

function mapDoctorAppointment(r: any) {
  return {
    id: r.id,
    status: r.status,
    reason: r.reason,
    patientTimezone: r.patient_timezone,
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    patient: { id: r.patient_id, fullName: r.patient_name, birthDate: r.birth_date },
    ...(r.price_minor !== undefined ? { price: { amountMinor: r.price_minor, currency: r.currency } } : {}),
  };
}

function mapConsultation(r: any) {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    version: r.version,
    complaints: r.complaints,
    anamnesis: r.anamnesis,
    assessment: r.assessment,
    recommendations: r.recommendations,
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    signedAt: r.signed_at ? new Date(r.signed_at).toISOString() : null,
  };
}
