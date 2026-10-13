import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type { CreateStandaloneEncounterDto, UpdateMedicalEncounterDto } from "./medical-encounter.dto";

const TERMINAL_STATUSES = ["completed", "cancelled", "no_show", "requires_offline_visit"] as const;
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled: ["waiting", "active", "cancelled", "no_show"],
  waiting: ["active", "cancelled", "no_show"],
  active: ["completed", "requires_offline_visit"],
  completed: [],
  cancelled: [],
  no_show: [],
  requires_offline_visit: [],
};

@Injectable()
export class MedicalEncountersService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireDoctor(principal: Principal) {
    if (!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role is required");
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select d.id,d.full_name from doctor_profiles d
       where d.account_user_id=$1 and d.verified=true limit 1`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Verified doctor profile is not linked to this account");
    return { user, doctor: rows[0] };
  }

  private map(row: any) {
    return {
      id: row.id,
      appointmentId: row.appointment_id,
      patientProfileId: row.patient_profile_id,
      doctorId: row.doctor_id,
      organizationId: row.organization_id,
      encounterType: row.encounter_type,
      status: row.status,
      version: row.version ?? 1,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      complaints: row.complaints,
      anamnesis: row.anamnesis,
      chronicConditions: row.chronic_conditions,
      allergies: row.allergies,
      currentMedications: row.current_medications,
      examinationData: row.examination_data ?? {},
      uploadedDocuments: row.uploaded_documents ?? [],
      clinicalAssessment: row.clinical_assessment,
      recommendations: row.recommendations,
      requiredTests: row.required_tests,
      needOfflineVisit: row.need_offline_visit,
      followUpRequired: row.follow_up_required,
      followUpDate: row.follow_up_date,
      doctorNotes: row.doctor_notes,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async assertRemoteTypeAllowed(client: any, patientId: string, doctorId: string, type: string) {
    if (!["followup_remote", "monitoring"].includes(type)) return;
    const prior = await client.query(
      `select 1 from medical_encounters
       where patient_profile_id=$1 and doctor_id=$2
         and encounter_type='offline_reference' and status='completed'
       limit 1`,
      [patientId, doctorId],
    );
    if (!prior.rowCount) {
      throw new UnprocessableEntityException(
        `${type} requires a prior completed offline_reference for this patient and treating doctor`,
      );
    }
  }

  private async accessibleEncounter(principal: Principal, id: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select e.*
       from medical_encounters e
       join patient_profiles p on p.id=e.patient_profile_id
       join doctor_profiles d on d.id=e.doctor_id
       where e.id=$1 and (
         p.owner_user_id=$2
         or d.account_user_id=$2
         or exists(select 1 from user_roles r where r.user_id=$2 and r.role='admin')
       )`,
      [id, user.id],
    );
    if (!rows[0]) throw new NotFoundException("Medical encounter not found");
    return { user, encounter: rows[0] };
  }

  async list(principal: Principal, filters: { patientId?: string; status?: string; type?: string }) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select e.*
       from medical_encounters e
       join patient_profiles p on p.id=e.patient_profile_id
       join doctor_profiles d on d.id=e.doctor_id
       where (
         p.owner_user_id=$1
         or d.account_user_id=$1
         or exists(select 1 from user_roles r where r.user_id=$1 and r.role='admin')
       )
       and ($2::uuid is null or e.patient_profile_id=$2)
       and ($3::text is null or e.status=$3)
       and ($4::text is null or e.encounter_type=$4)
       order by e.created_at desc
       limit 200`,
      [user.id, filters.patientId ?? null, filters.status ?? null, filters.type ?? null],
    );
    return rows.map((row) => this.map(row));
  }

  async get(principal: Principal, id: string) {
    const { user, encounter } = await this.accessibleEncounter(principal, id);
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_encounter.view", resourceType: "medical_encounter", resourceId: id });
    return this.map(encounter);
  }

  async byAppointment(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select e.*
       from medical_encounters e
       join patient_profiles p on p.id=e.patient_profile_id
       join doctor_profiles d on d.id=e.doctor_id
       where e.appointment_id=$1 and (
         p.owner_user_id=$2
         or d.account_user_id=$2
         or exists(select 1 from user_roles r where r.user_id=$2 and r.role='admin')
       )`,
      [appointmentId, user.id],
    );
    if (!rows[0]) throw new NotFoundException("Medical encounter not found");
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_encounter.view", resourceType: "medical_encounter", resourceId: rows[0].id });
    return this.map(rows[0]);
  }

  async createStandalone(principal: Principal, input: CreateStandaloneEncounterDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    const created = await this.db.tx(async (client) => {
      const patient = await client.query(
        `select p.id from patient_profiles p
         where p.id=$1 and p.archived_at is null
           and exists(
             select 1 from appointments a where a.patient_profile_id=p.id and a.doctor_id=$2
             union all
             select 1 from medical_encounters e where e.patient_profile_id=p.id and e.doctor_id=$2
           )`,
        [input.patientProfileId, doctor.id],
      );
      if (!patient.rowCount) throw new ForbiddenException("Doctor has no established relationship with this patient");
      await this.assertRemoteTypeAllowed(client, input.patientProfileId, doctor.id, input.encounterType);
      const { rows } = await client.query(
        `insert into medical_encounters(appointment_id,patient_profile_id,doctor_id,encounter_type,status,doctor_notes)
         values (null,$1,$2,$3,'scheduled',$4) returning *`,
        [input.patientProfileId, doctor.id, input.encounterType, input.doctorNotes ?? null],
      );
      await client.query(
        `insert into medical_encounter_status_history(encounter_id,from_status,to_status,changed_by_user_id,reason)
         values ($1,null,'scheduled',$2,'created')`,
        [rows[0].id, user.id],
      );
      return rows[0];
    });
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_encounter.create", resourceType: "medical_encounter", resourceId: created.id, metadata: { type: input.encounterType } });
    return this.map(created);
  }

  async updateByAppointment(principal: Principal, appointmentId: string, input: UpdateMedicalEncounterDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    if (input.followUpDate && input.followUpRequired === false) throw new UnprocessableEntityException("followUpDate requires followUpRequired=true");
    const result = await this.db.tx(async (client) => {
      const relation = await client.query(
        `select a.id,a.patient_profile_id,a.status from appointments a
         where a.id=$1 and a.doctor_id=$2 for update of a`,
        [appointmentId, doctor.id],
      );
      const appointment = relation.rows[0];
      if (!appointment) throw new NotFoundException("Appointment not found");
      if (["cancelled_by_patient", "cancelled_by_doctor", "no_show"].includes(appointment.status)) throw new UnprocessableEntityException("Closed appointment cannot be edited");
      const signed = await client.query(`select signed_at from consultations where appointment_id=$1 for update`, [appointmentId]);
      if (signed.rows[0]?.signed_at) throw new ConflictException("Signed clinical conclusion is immutable. Start an amendment before editing the encounter.");
      const current = await client.query(`select * from medical_encounters where appointment_id=$1 for update`, [appointmentId]);
      const desiredType = input.encounterType ?? current.rows[0]?.encounter_type ?? "primary_remote";
      await this.assertRemoteTypeAllowed(client, appointment.patient_profile_id, doctor.id, desiredType);
      const encounterStatus = appointment.status === "in_progress" ? "active" : appointment.status === "completed" ? "completed" : appointment.status === "patient_checked_in" ? "waiting" : "scheduled";
      const { rows } = await client.query(
        `insert into medical_encounters(
           appointment_id,patient_profile_id,doctor_id,encounter_type,status,
           complaints,anamnesis,chronic_conditions,allergies,current_medications,examination_data,
           clinical_assessment,recommendations,required_tests,need_offline_visit,follow_up_required,follow_up_date,doctor_notes,
           started_at,completed_at
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11::jsonb,'{}'::jsonb),
           $12,$13,$14,coalesce($15,false),coalesce($16,false),$17,$18,
           case when $5='active' then now() else null end,case when $5='completed' then now() else null end
         )
         on conflict (appointment_id) where appointment_id is not null do update set
           encounter_type=$4,
           complaints=coalesce($6,medical_encounters.complaints),
           anamnesis=coalesce($7,medical_encounters.anamnesis),
           chronic_conditions=coalesce($8,medical_encounters.chronic_conditions),
           allergies=coalesce($9,medical_encounters.allergies),
           current_medications=coalesce($10,medical_encounters.current_medications),
           examination_data=coalesce($11::jsonb,medical_encounters.examination_data),
           clinical_assessment=coalesce($12,medical_encounters.clinical_assessment),
           recommendations=coalesce($13,medical_encounters.recommendations),
           required_tests=coalesce($14,medical_encounters.required_tests),
           need_offline_visit=coalesce($15,medical_encounters.need_offline_visit),
           follow_up_required=coalesce($16,medical_encounters.follow_up_required),
           follow_up_date=case when $16=false then null else coalesce($17,medical_encounters.follow_up_date) end,
           doctor_notes=coalesce($18,medical_encounters.doctor_notes),
           status=case when coalesce($15,medical_encounters.need_offline_visit) then 'requires_offline_visit' else $5 end,
           started_at=case when $5='active' then coalesce(medical_encounters.started_at,now()) else medical_encounters.started_at end,
           completed_at=case when $5='completed' then coalesce(medical_encounters.completed_at,now()) else medical_encounters.completed_at end,
           version=medical_encounters.version+1,updated_at=now()
         returning *`,
        [appointmentId, appointment.patient_profile_id, doctor.id, desiredType, encounterStatus,
          input.complaints ?? null, input.anamnesis ?? null, input.chronicConditions ?? null,
          input.allergies ?? null, input.currentMedications ?? null,
          input.examinationData === undefined ? null : JSON.stringify(input.examinationData),
          input.clinicalAssessment ?? null, input.recommendations ?? null, input.requiredTests ?? null,
          input.needOfflineVisit ?? null, input.followUpRequired ?? null, input.followUpDate ?? null, input.doctorNotes ?? null],
      );
      const encounter = rows[0];
      await client.query(
        `insert into consultations(appointment_id,encounter_id,complaints,anamnesis,assessment,recommendations,started_at)
         values ($1,$2,$3,$4,$5,$6,case when $7='active' then now() else null end)
         on conflict (appointment_id) do update set
           encounter_id=coalesce(consultations.encounter_id,excluded.encounter_id),
           complaints=coalesce($3,consultations.complaints),anamnesis=coalesce($4,consultations.anamnesis),
           assessment=coalesce($5,consultations.assessment),recommendations=coalesce($6,consultations.recommendations),updated_at=now()`,
        [appointmentId, encounter.id, input.complaints ?? null, input.anamnesis ?? null, input.clinicalAssessment ?? null, input.recommendations ?? null, encounterStatus],
      );
      return encounter;
    });
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_encounter.update", resourceType: "medical_encounter", resourceId: result.id, metadata: { appointmentId } });
    return this.map(result);
  }

  async updateStandalone(principal: Principal, id: string, input: UpdateMedicalEncounterDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    if (input.followUpDate && input.followUpRequired === false) throw new UnprocessableEntityException("followUpDate requires followUpRequired=true");
    const result = await this.db.tx(async (client) => {
      const found = await client.query(`select * from medical_encounters where id=$1 and doctor_id=$2 and appointment_id is null for update`, [id, doctor.id]);
      const current = found.rows[0];
      if (!current) throw new NotFoundException("Standalone medical encounter not found");
      if ((TERMINAL_STATUSES as readonly string[]).includes(current.status)) throw new ConflictException("Completed encounter is immutable");
      const desiredType = input.encounterType ?? current.encounter_type;
      if (!["offline_reference", "monitoring", "consultation_review"].includes(desiredType)) throw new UnprocessableEntityException("Standalone encounter type is not allowed");
      await this.assertRemoteTypeAllowed(client, current.patient_profile_id, doctor.id, desiredType);
      const { rows } = await client.query(
        `update medical_encounters set encounter_type=$3,
           complaints=coalesce($4,complaints),anamnesis=coalesce($5,anamnesis),chronic_conditions=coalesce($6,chronic_conditions),
           allergies=coalesce($7,allergies),current_medications=coalesce($8,current_medications),examination_data=coalesce($9::jsonb,examination_data),
           clinical_assessment=coalesce($10,clinical_assessment),recommendations=coalesce($11,recommendations),required_tests=coalesce($12,required_tests),
           need_offline_visit=coalesce($13,need_offline_visit),follow_up_required=coalesce($14,follow_up_required),
           follow_up_date=case when $14=false then null else coalesce($15,follow_up_date) end,doctor_notes=coalesce($16,doctor_notes),
           version=version+1,updated_at=now()
         where id=$1 and doctor_id=$2 returning *`,
        [id, doctor.id, desiredType, input.complaints ?? null, input.anamnesis ?? null, input.chronicConditions ?? null,
          input.allergies ?? null, input.currentMedications ?? null, input.examinationData === undefined ? null : JSON.stringify(input.examinationData),
          input.clinicalAssessment ?? null, input.recommendations ?? null, input.requiredTests ?? null, input.needOfflineVisit ?? null,
          input.followUpRequired ?? null, input.followUpDate ?? null, input.doctorNotes ?? null],
      );
      return rows[0];
    });
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_encounter.update", resourceType: "medical_encounter", resourceId: id });
    return this.map(result);
  }

  async transition(principal: Principal, id: string, nextStatus: string, reason?: string) {
    const { user, doctor } = await this.requireDoctor(principal);
    const result = await this.db.tx(async (client) => {
      const found = await client.query(`select * from medical_encounters where id=$1 and doctor_id=$2 and appointment_id is null for update`, [id, doctor.id]);
      const current = found.rows[0];
      if (!current) throw new NotFoundException("Standalone medical encounter not found");
      if (current.status === nextStatus) return current;
      if (!(ALLOWED_TRANSITIONS[current.status] ?? []).includes(nextStatus)) throw new ConflictException(`Invalid encounter transition: ${current.status} -> ${nextStatus}`);
      if (nextStatus === "completed" && current.encounter_type === "monitoring") await this.assertRemoteTypeAllowed(client, current.patient_profile_id, doctor.id, "monitoring");
      const { rows } = await client.query(
        `update medical_encounters set status=$3,
           started_at=case when $3='active' then coalesce(started_at,now()) else started_at end,
           completed_at=case when $3 in ('completed','requires_offline_visit') then coalesce(completed_at,now()) else completed_at end,
           need_offline_visit=case when $3='requires_offline_visit' then true else need_offline_visit end,
           status_changed_at=now(),version=version+1,updated_at=now()
         where id=$1 and doctor_id=$2 returning *`,
        [id, doctor.id, nextStatus],
      );
      await client.query(
        `insert into medical_encounter_status_history(encounter_id,from_status,to_status,changed_by_user_id,reason)
         values ($1,$2,$3,$4,$5)`,
        [id, current.status, nextStatus, user.id, reason ?? null],
      );
      return rows[0];
    });
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_encounter.status.change", resourceType: "medical_encounter", resourceId: id, metadata: { to: nextStatus, reason: reason ?? null } });
    return this.map(result);
  }
}
