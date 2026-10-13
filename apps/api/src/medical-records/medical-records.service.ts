import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type { CreateAllergyDto, CreateDiagnosisDto, CreateMedicationDto, CreateRecordTestDto } from "./medical-record.dto";

@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireDoctor(principal: Principal) {
    if (!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role is required");
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select d.id from doctor_profiles d where d.account_user_id=$1 and d.verified=true limit 1`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Verified doctor profile is required");
    return { user, doctorId: rows[0].id as string };
  }

  private async assertReadAccess(principal: Principal, patientId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select p.id from patient_profiles p
       where p.id=$1 and p.archived_at is null and (
         p.owner_user_id=$2
         or exists(
           select 1 from doctor_profiles d
           where d.account_user_id=$2 and d.verified=true and (
             exists(select 1 from appointments a where a.patient_profile_id=p.id and a.doctor_id=d.id)
             or exists(select 1 from medical_encounters e where e.patient_profile_id=p.id and e.doctor_id=d.id)
           )
         )
         or exists(select 1 from user_roles r where r.user_id=$2 and r.role='admin')
         or exists(select 1 from patient_representatives pr join representative_permissions rp on rp.representative_id=pr.id where pr.patient_profile_id=p.id and pr.representative_user_id=$2 and pr.status='verified' and rp.scope='read_record' and rp.revoked_at is null and (pr.valid_from is null or pr.valid_from<=current_date) and (pr.valid_until is null or pr.valid_until>=current_date))
       )`,
      [patientId, user.id],
    );
    if (!rows[0]) throw new NotFoundException("Medical record not found");
    return user;
  }

  private async requireWritableRecord(client: any, patientId: string, doctorId: string, encounterId: string) {
    const relation = await client.query(
      `select e.id,mr.id medical_record_id
       from medical_encounters e
       join medical_records mr on mr.patient_profile_id=e.patient_profile_id
       where e.id=$1 and e.patient_profile_id=$2 and e.doctor_id=$3
         and e.status not in ('cancelled','no_show')`,
      [encounterId, patientId, doctorId],
    );
    if (!relation.rows[0]) throw new ForbiddenException("Source encounter does not authorize this clinical write");
    return relation.rows[0].medical_record_id as string;
  }

  async get(principal: Principal, patientId: string) {
    const user = await this.assertReadAccess(principal, patientId);
    const record = await this.db.query(
      `select mr.id,mr.patient_profile_id,mr.created_at,mr.updated_at,p.full_name,p.birth_date,p.sex
       from medical_records mr join patient_profiles p on p.id=mr.patient_profile_id
       where mr.patient_profile_id=$1`,
      [patientId],
    );
    if (!record.rows[0]) throw new NotFoundException("Medical record not found");
    const recordId = record.rows[0].id;
    const [diagnoses, allergies, medications, tests, encounters, documents, conclusions, consents] = await Promise.all([
      this.db.query(`select * from record_diagnoses where medical_record_id=$1 order by diagnosed_at desc,created_at desc`, [recordId]),
      this.db.query(`select * from record_allergies where medical_record_id=$1 order by created_at desc`, [recordId]),
      this.db.query(`select * from record_medications where medical_record_id=$1 order by created_at desc`, [recordId]),
      this.db.query(`select * from record_tests where medical_record_id=$1 order by ordered_at desc`, [recordId]),
      this.db.query(`select id,appointment_id,doctor_id,organization_id,encounter_type,status,started_at,completed_at,clinical_assessment,recommendations,need_offline_visit,follow_up_required,follow_up_date from medical_encounters where patient_profile_id=$1 order by created_at desc`, [patientId]),
      this.db.query(`select id,original_name,mime_type,size_bytes,category,status,created_at from medical_documents where patient_profile_id=$1 and status='active' order by created_at desc`, [patientId]),
      this.db.query(`select cv.id,cv.appointment_id,cv.version_no,cv.snapshot,cv.content_sha256,cv.signed_at,cv.signature_method from consultation_versions cv join appointments a on a.id=cv.appointment_id where a.patient_profile_id=$1 order by cv.signed_at desc`, [patientId]),
      this.db.query(`select ca.id,cd.consent_type,cd.version,cd.locale,ca.accepted_at,ca.evidence from consent_acceptances ca join consent_documents cd on cd.id=ca.consent_document_id where ca.patient_profile_id=$1 order by ca.accepted_at desc`, [patientId]),
    ]);
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "medical_record.view", resourceType: "medical_record", resourceId: recordId });
    return {
      id: recordId,
      patient: {
        id: record.rows[0].patient_profile_id,
        fullName: record.rows[0].full_name,
        birthDate: record.rows[0].birth_date,
        sex: record.rows[0].sex,
      },
      diagnoses: diagnoses.rows,
      allergies: allergies.rows,
      medications: medications.rows,
      tests: tests.rows,
      encounters: encounters.rows,
      documents: documents.rows,
      conclusions: conclusions.rows,
      consents: consents.rows,
      createdAt: new Date(record.rows[0].created_at).toISOString(),
      updatedAt: new Date(record.rows[0].updated_at).toISOString(),
    };
  }

  async addDiagnosis(principal: Principal, patientId: string, input: CreateDiagnosisDto) {
    const { user, doctorId } = await this.requireDoctor(principal);
    const row = await this.db.tx(async (client) => {
      const recordId = await this.requireWritableRecord(client, patientId, doctorId, input.sourceEncounterId);
      const { rows } = await client.query(
        `insert into record_diagnoses(medical_record_id,source_encounter_id,code,code_system,display,clinical_status,diagnosed_at,created_by_doctor_id)
         values ($1,$2,$3,$4,$5,coalesce($6,'active'),coalesce($7::timestamptz,now()),$8) returning *`,
        [recordId,input.sourceEncounterId,input.code ?? null,input.codeSystem ?? null,input.display,input.clinicalStatus ?? null,input.diagnosedAt ?? null,doctorId],
      );
      await client.query(`update medical_records set updated_at=now() where id=$1`, [recordId]);
      return rows[0];
    });
    await this.audit.record({ actorUserId:user.id,actorSubject:principal.sub,action:"medical_record.diagnosis.create",resourceType:"record_diagnosis",resourceId:row.id,metadata:{patientId,sourceEncounterId:input.sourceEncounterId} });
    return row;
  }

  async addAllergy(principal: Principal, patientId: string, input: CreateAllergyDto) {
    const { user, doctorId } = await this.requireDoctor(principal);
    const row = await this.db.tx(async (client) => {
      const recordId = await this.requireWritableRecord(client, patientId, doctorId, input.sourceEncounterId);
      const { rows } = await client.query(
        `insert into record_allergies(medical_record_id,source_encounter_id,allergen,reaction,severity,clinical_status,created_by_doctor_id)
         values ($1,$2,$3,$4,$5,coalesce($6,'active'),$7) returning *`,
        [recordId,input.sourceEncounterId,input.allergen,input.reaction ?? null,input.severity ?? null,input.clinicalStatus ?? null,doctorId],
      );
      await client.query(`update medical_records set updated_at=now() where id=$1`, [recordId]);
      return rows[0];
    });
    await this.audit.record({ actorUserId:user.id,actorSubject:principal.sub,action:"medical_record.allergy.create",resourceType:"record_allergy",resourceId:row.id,metadata:{patientId,sourceEncounterId:input.sourceEncounterId} });
    return row;
  }

  async addMedication(principal: Principal, patientId: string, input: CreateMedicationDto) {
    const { user, doctorId } = await this.requireDoctor(principal);
    const row = await this.db.tx(async (client) => {
      const recordId = await this.requireWritableRecord(client, patientId, doctorId, input.sourceEncounterId);
      const { rows } = await client.query(
        `insert into record_medications(medical_record_id,source_encounter_id,medication_name,dosage,route,frequency,clinical_status,started_at,ended_at,created_by_doctor_id)
         values ($1,$2,$3,$4,$5,$6,coalesce($7,'active'),$8::date,$9::date,$10) returning *`,
        [recordId,input.sourceEncounterId,input.medicationName,input.dosage ?? null,input.route ?? null,input.frequency ?? null,input.clinicalStatus ?? null,input.startedAt ?? null,input.endedAt ?? null,doctorId],
      );
      await client.query(`update medical_records set updated_at=now() where id=$1`, [recordId]);
      return rows[0];
    });
    await this.audit.record({ actorUserId:user.id,actorSubject:principal.sub,action:"medical_record.medication.create",resourceType:"record_medication",resourceId:row.id,metadata:{patientId,sourceEncounterId:input.sourceEncounterId} });
    return row;
  }

  async addTest(principal: Principal, patientId: string, input: CreateRecordTestDto) {
    const { user, doctorId } = await this.requireDoctor(principal);
    const row = await this.db.tx(async (client) => {
      const recordId = await this.requireWritableRecord(client, patientId, doctorId, input.sourceEncounterId);
      const { rows } = await client.query(
        `insert into record_tests(medical_record_id,source_encounter_id,test_code,test_name,status,result_text,resulted_at,created_by_doctor_id)
         values ($1,$2,$3,$4,coalesce($5,'ordered'),$6,$7::timestamptz,$8) returning *`,
        [recordId,input.sourceEncounterId,input.testCode ?? null,input.testName,input.status ?? null,input.resultText ?? null,input.resultedAt ?? null,doctorId],
      );
      await client.query(`update medical_records set updated_at=now() where id=$1`, [recordId]);
      return rows[0];
    });
    await this.audit.record({ actorUserId:user.id,actorSubject:principal.sub,action:"medical_record.test.create",resourceType:"record_test",resourceId:row.id,metadata:{patientId,sourceEncounterId:input.sourceEncounterId} });
    return row;
  }
}
