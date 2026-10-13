import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Principal } from "../../auth/principal";
import { AuditService } from "../../audit/audit.service";
import { DbService } from "../../db/db.service";
import { UsersService } from "../../users/users.service";
import type {
  CreateEgiszIntegrationJobDto,
  EgiszAdapterKind,
  IntegrationTargetType,
  ListEgiszIntegrationJobsQueryDto,
} from "./egisz-integration.dto";

const EXPECTED_TARGET: Record<EgiszAdapterKind, IntegrationTargetType> = {
  organization_registry: "medical_organization",
  doctor_registry: "doctor",
  remd: "medical_document_version",
  patient: "patient",
};

type SafeResultMetadata = Record<string, string | number | boolean | null>;

@Injectable()
export class EgiszIntegrationService {
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

  private async ensureTargetExists(targetType: IntegrationTargetType, targetId: string) {
    const sqlByTarget: Record<IntegrationTargetType, string> = {
      medical_organization: `select 1 ok from medical_organizations where id=$1`,
      doctor: `select 1 ok from doctor_profiles where id=$1`,
      medical_document_version: `select 1 ok from medical_document_versions where id=$1`,
      patient: `select 1 ok from patient_profiles where id=$1`,
    };
    const { rows } = await this.db.query<{ ok: number }>(sqlByTarget[targetType], [targetId]);
    if (!rows[0]) throw new NotFoundException(`${targetType} not found`);
  }

  private assertAdapterTarget(adapterKind: EgiszAdapterKind, targetType: IntegrationTargetType) {
    if (EXPECTED_TARGET[adapterKind] !== targetType) {
      throw new BadRequestException(`Adapter ${adapterKind} cannot process target ${targetType}`);
    }
  }

  async enqueue(principal: Principal, input: CreateEgiszIntegrationJobDto) {
    const actor = await this.requireAdmin(principal);
    this.assertAdapterTarget(input.adapterKind, input.targetType);
    await this.ensureTargetExists(input.targetType, input.targetId);

    const result = await this.db.tx(async (client) => {
      const existing = await client.query(
        `select id,adapter_kind,operation,target_type,target_id,status
         from integration_jobs where provider='egisz' and idempotency_key=$1`,
        [input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (
          row.adapter_kind !== input.adapterKind ||
          row.operation !== input.operation ||
          row.target_type !== input.targetType ||
          row.target_id !== input.targetId
        ) {
          throw new ConflictException("Idempotency key is already used for a different integration request");
        }
        return { created: false, job: row };
      }

      const inserted = await client.query(
        `insert into integration_jobs(
           adapter_kind,operation,target_type,target_id,idempotency_key,priority,max_attempts,created_by_user_id
         ) values($1,$2,$3,$4,$5,$6,$7,$8)
         returning id,provider,adapter_kind,operation,target_type,target_id,idempotency_key,status,
                   priority,attempt_count,max_attempts,available_at,created_at,updated_at`,
        [
          input.adapterKind,
          input.operation.trim(),
          input.targetType,
          input.targetId,
          input.idempotencyKey.trim(),
          input.priority ?? 100,
          input.maxAttempts ?? 5,
          actor.id,
        ],
      );
      const job = inserted.rows[0];
      await client.query(
        `insert into integration_events(job_id,event_type,metadata)
         values($1,'queued',$2::jsonb)`,
        [job.id, JSON.stringify({ source: "admin_api" })],
      );
      return { created: true, job };
    });

    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: result.created ? "egisz.integration_job.created" : "egisz.integration_job.reused",
      resourceType: "integration_job",
      resourceId: result.job.id,
      metadata: {
        adapterKind: input.adapterKind,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });

    return this.get(principal, result.job.id);
  }

  async list(principal: Principal, query: ListEgiszIntegrationJobsQueryDto) {
    await this.requireAdmin(principal);
    const params: unknown[] = [];
    const where = [`provider='egisz'`];
    if (query.status) {
      params.push(query.status);
      where.push(`status=$${params.length}`);
    }
    if (query.adapterKind) {
      params.push(query.adapterKind);
      where.push(`adapter_kind=$${params.length}`);
    }
    params.push(query.limit ?? 100);
    const limitParam = `$${params.length}`;
    const { rows } = await this.db.query(
      `select id,provider,adapter_kind as "adapterKind",operation,target_type as "targetType",
              target_id as "targetId",idempotency_key as "idempotencyKey",status,priority,
              attempt_count as "attemptCount",max_attempts as "maxAttempts",available_at as "availableAt",
              locked_at as "lockedAt",completed_at as "completedAt",result_metadata as "resultMetadata",
              created_at as "createdAt",updated_at as "updatedAt"
       from integration_jobs
       where ${where.join(" and ")}
       order by created_at desc
       limit ${limitParam}`,
      params,
    );
    return rows;
  }

  async get(principal: Principal, jobId: string) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select id,provider,adapter_kind as "adapterKind",operation,target_type as "targetType",
              target_id as "targetId",idempotency_key as "idempotencyKey",status,priority,
              attempt_count as "attemptCount",max_attempts as "maxAttempts",available_at as "availableAt",
              locked_at as "lockedAt",completed_at as "completedAt",result_metadata as "resultMetadata",
              created_at as "createdAt",updated_at as "updatedAt"
       from integration_jobs where id=$1 and provider='egisz'`,
      [jobId],
    );
    const job = rows[0];
    if (!job) throw new NotFoundException("Integration job not found");

    const [events, errors, retries] = await Promise.all([
      this.db.query(
        `select id,event_type as "eventType",occurred_at as "occurredAt",metadata
         from integration_events where job_id=$1 order by occurred_at,id`,
        [jobId],
      ),
      this.db.query(
        `select id,attempt_no as "attemptNo",error_code as "errorCode",
                sanitized_message as "message",retriable,occurred_at as "occurredAt"
         from integration_errors where job_id=$1 order by attempt_no`,
        [jobId],
      ),
      this.db.query(
        `select id,attempt_no as "attemptNo",scheduled_at as "scheduledAt",
                reason_code as "reasonCode",status,created_at as "createdAt"
         from integration_retries where job_id=$1 order by attempt_no`,
        [jobId],
      ),
    ]);
    return { ...job, events: events.rows, errors: errors.rows, retries: retries.rows };
  }

  async retry(principal: Principal, jobId: string) {
    const actor = await this.requireAdmin(principal);
    const job = await this.db.tx(async (client) => {
      const current = await client.query(
        `select id,status,attempt_count,max_attempts from integration_jobs
         where id=$1 and provider='egisz' for update`,
        [jobId],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("Integration job not found");
      if (row.status !== "failed") throw new ConflictException("Only failed integration jobs can be retried manually");
      if (row.attempt_count >= row.max_attempts) throw new ConflictException("Maximum integration attempts reached");

      const nextAttempt = Number(row.attempt_count) + 1;
      await client.query(
        `update integration_jobs
         set status='queued',available_at=now(),locked_at=null,locked_by=null,completed_at=null,updated_at=now()
         where id=$1`,
        [jobId],
      );
      await client.query(
        `insert into integration_retries(job_id,attempt_no,scheduled_at,reason_code,status)
         values($1,$2,now(),'manual_retry','scheduled')
         on conflict(job_id,attempt_no) do update
           set scheduled_at=excluded.scheduled_at,reason_code=excluded.reason_code,status='scheduled'`,
        [jobId, nextAttempt],
      );
      await client.query(
        `insert into integration_events(job_id,event_type,metadata)
         values($1,'retry_scheduled',$2::jsonb)`,
        [jobId, JSON.stringify({ attemptNo: nextAttempt, source: "admin_api" })],
      );
      const refreshed = await client.query(`select * from integration_jobs where id=$1`, [jobId]);
      return refreshed.rows[0];
    });

    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: "egisz.integration_job.retry_scheduled",
      resourceType: "integration_job",
      resourceId: jobId,
    });
    return this.get(principal, jobId);
  }

  async claimNext(workerId: string) {
    if (!workerId || workerId.length > 120) throw new BadRequestException("Invalid worker id");
    return this.db.tx(async (client) => {
      const selected = await client.query(
        `select id from integration_jobs
         where provider='egisz' and status='queued' and available_at<=now() and attempt_count<max_attempts
         order by priority desc,available_at,created_at
         for update skip locked limit 1`,
      );
      if (!selected.rows[0]) return null;
      const jobId = selected.rows[0].id;
      const updated = await client.query(
        `update integration_jobs
         set status='processing',attempt_count=attempt_count+1,locked_at=now(),locked_by=$2,updated_at=now()
         where id=$1
         returning id,adapter_kind as "adapterKind",operation,target_type as "targetType",target_id as "targetId",
                   attempt_count as "attemptCount",max_attempts as "maxAttempts"`,
        [jobId, workerId],
      );
      const job = updated.rows[0];
      await client.query(
        `update integration_retries set status='claimed'
         where job_id=$1 and attempt_no=$2 and status='scheduled'`,
        [jobId, job.attemptCount],
      );
      await client.query(
        `insert into integration_events(job_id,event_type,metadata)
         values($1,'started',$2::jsonb)`,
        [jobId, JSON.stringify({ attemptNo: job.attemptCount, workerId })],
      );
      return job;
    });
  }

  async markSucceeded(jobId: string, metadata: SafeResultMetadata = {}) {
    return this.db.tx(async (client) => {
      const current = await client.query(
        `select id,status,attempt_count from integration_jobs where id=$1 and provider='egisz' for update`,
        [jobId],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("Integration job not found");
      if (row.status !== "processing") throw new ConflictException("Integration job is not processing");
      await client.query(
        `update integration_jobs
         set status='succeeded',result_metadata=$2::jsonb,completed_at=now(),locked_at=null,locked_by=null,updated_at=now()
         where id=$1`,
        [jobId, JSON.stringify(metadata)],
      );
      await client.query(
        `update integration_retries set status='completed'
         where job_id=$1 and attempt_no=$2 and status='claimed'`,
        [jobId, row.attempt_count],
      );
      await client.query(
        `insert into integration_events(job_id,event_type,metadata)
         values($1,'succeeded',$2::jsonb)`,
        [jobId, JSON.stringify({ attemptNo: row.attempt_count, ...metadata })],
      );
      return { id: jobId, status: "succeeded" as const };
    });
  }

  async markFailed(jobId: string, input: { errorCode: string; message: string; retriable: boolean }) {
    const errorCode = input.errorCode.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120) || "integration_error";
    const message = input.message.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000) || "Integration request failed";

    return this.db.tx(async (client) => {
      const current = await client.query(
        `select id,status,attempt_count,max_attempts from integration_jobs
         where id=$1 and provider='egisz' for update`,
        [jobId],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("Integration job not found");
      if (row.status !== "processing") throw new ConflictException("Integration job is not processing");

      const attemptNo = Number(row.attempt_count);
      const canRetry = input.retriable && attemptNo < Number(row.max_attempts);
      await client.query(
        `insert into integration_errors(job_id,attempt_no,error_code,sanitized_message,retriable)
         values($1,$2,$3,$4,$5)`,
        [jobId, attemptNo, errorCode, message, canRetry],
      );
      await client.query(
        `insert into integration_events(job_id,event_type,metadata)
         values($1,'failed',$2::jsonb)`,
        [jobId, JSON.stringify({ attemptNo, errorCode, retriable: canRetry })],
      );

      if (!canRetry) {
        await client.query(
          `update integration_jobs
           set status='failed',completed_at=now(),locked_at=null,locked_by=null,updated_at=now()
           where id=$1`,
          [jobId],
        );
        return { id: jobId, status: "failed" as const, retryScheduled: false };
      }

      const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, attemptNo - 1));
      const nextAttempt = attemptNo + 1;
      const retry = await client.query<{ scheduled_at: Date }>(
        `insert into integration_retries(job_id,attempt_no,scheduled_at,reason_code,status)
         values($1,$2,now()+($3::text || ' seconds')::interval,$4,'scheduled')
         returning scheduled_at`,
        [jobId, nextAttempt, delaySeconds, errorCode],
      );
      await client.query(
        `update integration_jobs
         set status='queued',available_at=$2,locked_at=null,locked_by=null,updated_at=now()
         where id=$1`,
        [jobId, retry.rows[0].scheduled_at],
      );
      await client.query(
        `insert into integration_events(job_id,event_type,metadata)
         values($1,'retry_scheduled',$2::jsonb)`,
        [jobId, JSON.stringify({ attemptNo: nextAttempt, delaySeconds, reasonCode: errorCode })],
      );
      return { id: jobId, status: "queued" as const, retryScheduled: true };
    });
  }
}
