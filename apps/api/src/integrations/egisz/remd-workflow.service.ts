import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { Principal } from "../../auth/principal";
import { AuditService } from "../../audit/audit.service";
import { DbService } from "../../db/db.service";
import { UsersService } from "../../users/users.service";
import { EgiszIntegrationService } from "./egisz-integration.service";
import type {
  ListRemdCandidatesQueryDto,
  ListRemdRegistrationsQueryDto,
} from "./remd-workflow.dto";

const REMD_REGISTRY = "egisz_remd";
const REMD_OPERATION = "submit_document";

type ReadinessRow = {
  documentVersionId: string;
  documentId: string;
  patientProfileId: string;
  versionNo: number;
  sha256Hex: string | null;
  documentStatus: string;
  scanStatus: string | null;
  signatureId: string | null;
  doctorId: string | null;
  signatureProvider: string | null;
  signedAt: Date | null;
  doctorRegulatoryStatus: string | null;
  organizationId: string | null;
  organizationActive: boolean | null;
};

@Injectable()
export class RemdWorkflowService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly egisz: EgiszIntegrationService,
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

  private async readinessRow(versionId: string, client?: PoolClient): Promise<ReadinessRow> {
    const sql = `select
         v.id as "documentVersionId",
         v.document_id as "documentId",
         d.patient_profile_id as "patientProfileId",
         v.version_no as "versionNo",
         v.sha256_hex as "sha256Hex",
         d.status as "documentStatus",
         d.scan_status as "scanStatus",
         sig.id as "signatureId",
         sig.signed_by_doctor_id as "doctorId",
         sig.provider as "signatureProvider",
         sig.signing_time as "signedAt",
         rp.regulatory_status as "doctorRegulatoryStatus",
         membership.organization_id as "organizationId",
         org.active as "organizationActive"
       from medical_document_versions v
       join medical_documents d on d.id=v.document_id
       left join lateral (
         select s.id,s.signed_by_doctor_id,s.provider,s.signing_time
         from medical_document_signatures s
         where s.document_version_id=v.id
           and s.signature_status='valid'
           and s.qualification_status='qualified'
         order by s.signing_time desc,s.id desc
         limit 1
       ) sig on true
       left join doctor_regulatory_profiles rp on rp.doctor_id=sig.signed_by_doctor_id
       left join lateral (
         select m.organization_id
         from doctor_organization_memberships m
         join medical_organizations mo on mo.id=m.organization_id and mo.active=true
         where m.doctor_id=sig.signed_by_doctor_id and m.active=true
           and (m.starts_at is null or m.starts_at<=current_date)
           and (m.ends_at is null or m.ends_at>=current_date)
         order by m.is_primary desc,m.created_at
         limit 1
       ) membership on true
       left join medical_organizations org on org.id=membership.organization_id
       where v.id=$1`;
    const result = client
      ? await client.query<ReadinessRow>(sql, [versionId])
      : await this.db.query<ReadinessRow>(sql, [versionId]);
    const rows = result.rows;
    if (!rows[0]) throw new NotFoundException("Medical document version not found");
    return rows[0];
  }

  private mapReadiness(row: ReadinessRow) {
    const checks = {
      immutableHash: Boolean(row.sha256Hex),
      documentActive: row.documentStatus === "active",
      scanClean: row.scanStatus === "clean",
      qualifiedSignature: Boolean(row.signatureId && row.doctorId),
      doctorRegulatoryVerified: row.doctorRegulatoryStatus === "verified",
      activeMedicalOrganization: Boolean(row.organizationId && row.organizationActive),
    };
    const blockers = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    return {
      documentVersionId: row.documentVersionId,
      documentId: row.documentId,
      patientProfileId: row.patientProfileId,
      versionNo: Number(row.versionNo),
      sha256Hex: row.sha256Hex,
      ready: blockers.length === 0,
      checks,
      blockers,
      signer: row.signatureId ? {
        signatureId: row.signatureId,
        doctorId: row.doctorId,
        provider: row.signatureProvider,
        signedAt: row.signedAt ? new Date(row.signedAt).toISOString() : null,
      } : null,
      organizationId: row.organizationId,
    };
  }

  async readiness(principal: Principal, versionId: string) {
    await this.requireAdmin(principal);
    return this.mapReadiness(await this.readinessRow(versionId));
  }

  async candidates(principal: Principal, query: ListRemdCandidatesQueryDto) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select
         v.id as "documentVersionId",
         v.document_id as "documentId",
         d.patient_profile_id as "patientProfileId",
         v.version_no as "versionNo",
         v.category,
         v.sha256_hex as "sha256Hex",
         sig.signed_by_doctor_id as "doctorId",
         membership.organization_id as "organizationId",
         v.created_at as "createdAt"
       from medical_document_versions v
       join medical_documents d on d.id=v.document_id and d.status='active' and d.scan_status='clean'
       join lateral (
         select s.signed_by_doctor_id
         from medical_document_signatures s
         join doctor_regulatory_profiles rp on rp.doctor_id=s.signed_by_doctor_id and rp.regulatory_status='verified'
         where s.document_version_id=v.id
           and s.signature_status='valid'
           and s.qualification_status='qualified'
         order by s.signing_time desc,s.id desc
         limit 1
       ) sig on true
       join lateral (
         select m.organization_id
         from doctor_organization_memberships m
         join medical_organizations mo on mo.id=m.organization_id and mo.active=true
         where m.doctor_id=sig.signed_by_doctor_id and m.active=true
           and (m.starts_at is null or m.starts_at<=current_date)
           and (m.ends_at is null or m.ends_at>=current_date)
         order by m.is_primary desc,m.created_at
         limit 1
       ) membership on true
       where v.sha256_hex is not null
         and not exists (
           select 1 from medical_document_registrations r
           where r.document_version_id=v.id and r.registry=$1
             and r.status in ('queued','submitted','registered')
         )
       order by v.created_at desc
       limit $2`,
      [REMD_REGISTRY, query.limit ?? 50],
    );
    return rows;
  }

  async list(principal: Principal, query: ListRemdRegistrationsQueryDto) {
    await this.requireAdmin(principal);
    const params: unknown[] = [REMD_REGISTRY];
    const where = [`r.registry=$1`];
    if (query.status) {
      params.push(query.status);
      where.push(`r.status=$${params.length}`);
    }
    params.push(query.limit ?? 100);
    const { rows } = await this.db.query(
      `select
         r.id,
         r.document_version_id as "documentVersionId",
         v.document_id as "documentId",
         d.patient_profile_id as "patientProfileId",
         v.version_no as "versionNo",
         v.category,
         r.status,
         r.external_id as "externalId",
         r.attempt_count as "attemptCount",
         r.last_error_code as "lastErrorCode",
         r.integration_job_id as "integrationJobId",
         j.status as "jobStatus",
         r.submitted_at as "submittedAt",
         r.registration_date as "registeredAt",
         r.created_at as "createdAt",
         r.updated_at as "updatedAt"
       from medical_document_registrations r
       join medical_document_versions v on v.id=r.document_version_id
       join medical_documents d on d.id=v.document_id
       left join integration_jobs j on j.id=r.integration_job_id
       where ${where.join(" and ")}
       order by r.updated_at desc,r.created_at desc
       limit $${params.length}`,
      params,
    );
    return rows;
  }

  async get(principal: Principal, versionId: string) {
    await this.requireAdmin(principal);
    const readiness = this.mapReadiness(await this.readinessRow(versionId));
    const { rows } = await this.db.query(
      `select
         r.id,r.registry,r.document_version_id as "documentVersionId",r.external_id as "externalId",
         r.status,r.registration_date as "registeredAt",r.attempt_count as "attemptCount",
         r.last_error_code as "lastErrorCode",r.integration_job_id as "integrationJobId",
         r.submitted_at as "submittedAt",r.last_attempt_at as "lastAttemptAt",
         r.created_at as "createdAt",r.updated_at as "updatedAt",
         j.status as "jobStatus",j.attempt_count as "jobAttemptCount",j.max_attempts as "jobMaxAttempts"
       from medical_document_registrations r
       left join integration_jobs j on j.id=r.integration_job_id
       where r.document_version_id=$1 and r.registry=$2`,
      [versionId, REMD_REGISTRY],
    );
    return { readiness, registration: rows[0] ?? null };
  }

  async requestRegistration(principal: Principal, versionId: string) {
    const actor = await this.requireAdmin(principal);
    const result = await this.db.tx(async (client) => {
      const readiness = this.mapReadiness(await this.readinessRow(versionId, client));
      if (!readiness.ready) {
        throw new ConflictException({
          message: "Medical document version is not ready for REMD registration",
          blockers: readiness.blockers,
        });
      }

      const current = await client.query(
        `select r.*,j.status job_status
         from medical_document_registrations r
         left join integration_jobs j on j.id=r.integration_job_id
         where r.document_version_id=$1 and r.registry=$2
         for update of r`,
        [versionId, REMD_REGISTRY],
      );
      const existing = current.rows[0];
      if (existing?.status === "registered") return { created: false, registrationId: existing.id };
      if (existing?.integration_job_id && ["queued", "processing", "succeeded"].includes(existing.job_status)) {
        return { created: false, registrationId: existing.id };
      }
      if (existing?.integration_job_id && existing.job_status === "failed") {
        throw new ConflictException("REMD registration failed; retry the linked integration job");
      }

      const idempotencyKey = `remd:submit:${versionId}`;
      const foundJob = await client.query(
        `select id,status,adapter_kind,target_type,target_id,operation
         from integration_jobs where provider='egisz' and idempotency_key=$1
         for update`,
        [idempotencyKey],
      );
      let job = foundJob.rows[0];
      let jobCreated = false;
      if (job) {
        if (
          job.adapter_kind !== "remd" ||
          job.target_type !== "medical_document_version" ||
          job.target_id !== versionId ||
          job.operation !== REMD_OPERATION
        ) {
          throw new ConflictException("REMD idempotency key is already bound to another request");
        }
      } else {
        const insertedJob = await client.query(
          `insert into integration_jobs(
             adapter_kind,operation,target_type,target_id,idempotency_key,priority,max_attempts,created_by_user_id
           ) values('remd',$1,'medical_document_version',$2,$3,200,5,$4)
           returning id,status`,
          [REMD_OPERATION, versionId, idempotencyKey, actor.id],
        );
        job = insertedJob.rows[0];
        jobCreated = true;
        await client.query(
          `insert into integration_events(job_id,event_type,metadata)
           values($1,'queued',$2::jsonb)`,
          [job.id, JSON.stringify({ source: "remd_workflow" })],
        );
      }

      const registrationStatus = job.status === "processing" || job.status === "succeeded"
        ? "submitted"
        : job.status === "failed" || job.status === "cancelled"
          ? "failed"
          : "queued";
      const registration = await client.query(
        `insert into medical_document_registrations(
           document_version_id,registry,status,integration_job_id,requested_by_user_id,metadata
         ) values($1,$2,$3,$4,$5,$6::jsonb)
         on conflict(document_version_id,registry) do update set
           status=case when medical_document_registrations.status='registered' then 'registered' else excluded.status end,
           integration_job_id=coalesce(medical_document_registrations.integration_job_id,excluded.integration_job_id),
           requested_by_user_id=coalesce(medical_document_registrations.requested_by_user_id,excluded.requested_by_user_id),
           metadata=medical_document_registrations.metadata || excluded.metadata,
           updated_at=now()
         returning id`,
        [
          versionId,
          REMD_REGISTRY,
          registrationStatus,
          job.id,
          actor.id,
          JSON.stringify({ readinessChecked: true, workflow: "remd" }),
        ],
      );
      return { created: jobCreated, registrationId: registration.rows[0].id };
    });

    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: result.created ? "remd.registration.queued" : "remd.registration.reused",
      resourceType: "medical_document_version",
      resourceId: versionId,
      metadata: { registry: REMD_REGISTRY },
    });
    return this.get(principal, versionId);
  }

  async refreshRegistration(principal: Principal, versionId: string) {
    const actor = await this.requireAdmin(principal);
    const result = await this.db.tx(async (client) => {
      const current = await client.query(
        `select r.id,r.status,r.external_id,r.integration_job_id,r.updated_at,j.status job_status
         from medical_document_registrations r
         left join integration_jobs j on j.id=r.integration_job_id
         where r.document_version_id=$1 and r.registry=$2
         for update of r`,
        [versionId, REMD_REGISTRY],
      );
      const registration = current.rows[0];
      if (!registration) throw new NotFoundException("REMD registration not found");
      if (registration.status !== "submitted") {
        throw new ConflictException("Only submitted REMD registrations can request a status check");
      }
      if (registration.job_status === "queued" || registration.job_status === "processing") {
        return { created: false, jobId: registration.integration_job_id };
      }

      const stamp = new Date(registration.updated_at).toISOString();
      const idempotencyKey = `remd:check:${versionId}:${stamp}`;
      const existing = await client.query(
        `select id,status from integration_jobs
         where provider='egisz' and idempotency_key=$1
         for update`,
        [idempotencyKey],
      );
      let job = existing.rows[0];
      let created = false;
      if (!job) {
        const inserted = await client.query(
          `insert into integration_jobs(
             adapter_kind,operation,target_type,target_id,idempotency_key,priority,max_attempts,created_by_user_id
           ) values('remd','check_registration','medical_document_version',$1,$2,150,5,$3)
           returning id,status`,
          [versionId, idempotencyKey, actor.id],
        );
        job = inserted.rows[0];
        created = true;
        await client.query(
          `insert into integration_events(job_id,event_type,metadata)
           values($1,'queued',$2::jsonb)`,
          [job.id, JSON.stringify({ source: "remd_status_check" })],
        );
      }
      await client.query(
        `update medical_document_registrations
         set integration_job_id=$2,updated_at=now()
         where id=$1`,
        [registration.id, job.id],
      );
      return { created, jobId: job.id };
    });

    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: result.created ? "remd.registration.status_check_queued" : "remd.registration.status_check_reused",
      resourceType: "medical_document_version",
      resourceId: versionId,
      metadata: { integrationJobId: result.jobId },
    });
    return this.get(principal, versionId);
  }

  async retry(principal: Principal, versionId: string) {
    const actor = await this.requireAdmin(principal);
    const { rows } = await this.db.query<{ integration_job_id: string | null }>(
      `select integration_job_id from medical_document_registrations
       where document_version_id=$1 and registry=$2`,
      [versionId, REMD_REGISTRY],
    );
    const jobId = rows[0]?.integration_job_id;
    if (!jobId) throw new NotFoundException("REMD registration job not found");
    await this.egisz.retry(principal, jobId);
    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: "remd.registration.retry_requested",
      resourceType: "medical_document_version",
      resourceId: versionId,
      metadata: { integrationJobId: jobId },
    });
    return this.get(principal, versionId);
  }
}
