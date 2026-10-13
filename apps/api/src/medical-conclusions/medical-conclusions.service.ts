import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class MedicalConclusionsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private map(row: any) {
    return {
      id: row.id,
      patientProfileId: row.patient_profile_id,
      doctorId: row.doctor_id,
      organizationId: row.organization_id,
      encounterId: row.encounter_id,
      consultationId: row.consultation_id,
      conclusionDate: new Date(row.conclusion_date).toISOString(),
      complaints: row.complaints,
      anamnesis: row.anamnesis,
      reviewedDocuments: row.reviewed_documents ?? [],
      clinicalAssessment: row.clinical_assessment,
      diagnosisInformation: row.diagnosis_information ?? [],
      recommendations: row.recommendations,
      investigations: row.investigations,
      offlineVisitRecommendation: row.offline_visit_recommendation,
      followUp: row.follow_up ?? {},
      contentSha256: row.content_sha256,
      signatureMethod: row.signature_method,
      signedAt: new Date(row.signed_at).toISOString(),
      documentVersion: row.document_version,
      registrationMetadata: row.registration_metadata ?? {},
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private async accessible(principal: Principal, conclusionId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select mc.*
       from medical_conclusions mc
       join patient_profiles p on p.id=mc.patient_profile_id
       join doctor_profiles d on d.id=mc.doctor_id
       where mc.id=$1 and (
         p.owner_user_id=$2
         or d.account_user_id=$2
         or exists(select 1 from user_roles r where r.user_id=$2 and r.role='admin')
       )`,
      [conclusionId, user.id],
    );
    if (!rows[0]) throw new NotFoundException("Medical conclusion not found");
    return { user, row: rows[0] };
  }

  async list(principal: Principal, patientId?: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select mc.*
       from medical_conclusions mc
       join patient_profiles p on p.id=mc.patient_profile_id
       join doctor_profiles d on d.id=mc.doctor_id
       where (
         p.owner_user_id=$1
         or d.account_user_id=$1
         or exists(select 1 from user_roles r where r.user_id=$1 and r.role='admin')
       ) and ($2::uuid is null or mc.patient_profile_id=$2)
       order by mc.conclusion_date desc
       limit 200`,
      [user.id, patientId ?? null],
    );
    return rows.map((row) => this.map(row));
  }

  async get(principal: Principal, id: string) {
    const { user, row } = await this.accessible(principal, id);
    await this.audit.record({ actorUserId:user.id,actorSubject:principal.sub,action:"medical_conclusion.view",resourceType:"medical_conclusion",resourceId:id });
    return this.map(row);
  }

  async download(principal: Principal, id: string) {
    const { user, row } = await this.accessible(principal, id);
    await this.audit.record({ actorUserId:user.id,actorSubject:principal.sub,action:"medical_conclusion.download",resourceType:"medical_conclusion",resourceId:id });
    return this.map(row);
  }
}
