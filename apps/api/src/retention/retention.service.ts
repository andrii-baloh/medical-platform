import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import {
  RETENTION_DATA_CLASSES,
  type RetentionDataClass,
  type UpsertRetentionPolicyDto,
} from "./retention.dto";

type RetentionPolicyRow = {
  id: string;
  data_class: RetentionDataClass;
  retention_days: number | null;
  action: "delete" | "soft_delete";
  legal_basis: string | null;
  active: boolean;
  updated_at: Date;
};

/** A class becomes automatically deletable only when a real executor exists. */
type Executor = {
  objectType: string;
  countSql: string;
  eligibleSql: string;
  mutateSql: string;
};

/**
 * Executors are deliberately explicit. A class without an executor keeps its
 * policy row but cannot be deleted by a job: clinical, accounting and audit
 * evidence must not disappear because a cron expression says so.
 */
const EXECUTORS: Partial<Record<RetentionDataClass, Executor>> = {
  consultation_materials: {
    objectType: "consultation_material",
    countSql: `select count(*)::int total from consultation_materials where created_at < $1`,
    eligibleSql: `select id from consultation_materials where created_at < $1 order by created_at limit $2`,
    mutateSql: `delete from consultation_materials where id = any($1::uuid[])`,
  },
  medical_documents: {
    objectType: "medical_document",
    countSql: `select count(*)::int total from medical_documents where created_at < $1 and status <> 'deleted'`,
    eligibleSql: `select id from medical_documents where created_at < $1 and status <> 'deleted' order by created_at limit $2`,
    // Soft delete only: the storage object and the immutable version history
    // stay intact until a storage-aware purge procedure is approved.
    mutateSql: `update medical_documents set status='deleted',updated_at=now() where id = any($1::uuid[]) and status <> 'deleted'`,
  },
};

const NON_AUTOMATIC_REASON: Record<string, string> = {
  audit_logs: "Audit records are integrity-protected evidence; deleting them requires a documented legal procedure outside the platform.",
  security_logs: "Security logs are used for incident investigation; their disposal follows the organization's incident procedure, not an automatic job.",
  payment_records: "Payment and fiscal records are accounting documents; retention and disposal are defined with the accountant and the KKT operator.",
  consent_records: "Signed consents are the legal basis for processing; they cannot be removed by an automatic retention job.",
};

const BATCH_SIZE = Number(process.env.RETENTION_BATCH_SIZE ?? 200);
const MAX_BATCHES = Number(process.env.RETENTION_MAX_BATCHES ?? 50);

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

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

  private assertClass(dataClass: string): asserts dataClass is RetentionDataClass {
    if (!(RETENTION_DATA_CLASSES as readonly string[]).includes(dataClass)) {
      throw new NotFoundException(`Unknown retention data class: ${dataClass}`);
    }
  }

  async listPolicies(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query<RetentionPolicyRow>(
      `select id,data_class,retention_days,action,legal_basis,active,updated_at from retention_policies`,
    );
    const byClass = new Map(rows.map((row) => [row.data_class, row]));
    return RETENTION_DATA_CLASSES.map((dataClass) => {
      const policy = byClass.get(dataClass) ?? null;
      return {
        dataClass,
        automatic: Boolean(EXECUTORS[dataClass]),
        automaticDisabledReason: EXECUTORS[dataClass] ? null : NON_AUTOMATIC_REASON[dataClass] ?? null,
        policy: policy
          ? {
              retentionDays: policy.retention_days,
              action: policy.action,
              legalBasis: policy.legal_basis,
              active: policy.active,
              updatedAt: new Date(policy.updated_at).toISOString(),
            }
          : null,
      };
    });
  }

  async upsertPolicy(principal: Principal, dataClass: string, input: UpsertRetentionPolicyDto) {
    const user = await this.requireAdmin(principal);
    this.assertClass(dataClass);

    const legalBasis = input.legalBasis?.trim();
    if (input.active && (!input.retentionDays || !legalBasis || legalBasis.length < 10)) {
      // The database repeats this check; failing early gives a readable error.
      throw new BadRequestException("An active retention policy requires retentionDays and a legal basis of at least 10 characters");
    }

    const { rows } = await this.db.query<RetentionPolicyRow>(
      `insert into retention_policies(data_class,retention_days,action,legal_basis,active,updated_by_user_id)
       values ($1,$2,coalesce($3,'delete'),$4,$5,$6)
       on conflict (data_class) do update
       set retention_days=excluded.retention_days,
           action=excluded.action,
           legal_basis=excluded.legal_basis,
           active=excluded.active,
           updated_by_user_id=excluded.updated_by_user_id,
           updated_at=now()
       returning id,data_class,retention_days,action,legal_basis,active,updated_at`,
      [dataClass, input.retentionDays ?? null, input.action, legalBasis ?? null, input.active, user.id],
    );

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "retention.policy.update",
      resourceType: "retention_policy",
      resourceId: rows[0].id,
      metadata: { dataClass, active: input.active, retentionDays: input.retentionDays ?? null },
    });
    return rows[0];
  }

  private async loadPolicy(dataClass: RetentionDataClass) {
    const { rows } = await this.db.query<RetentionPolicyRow>(
      `select id,data_class,retention_days,action,legal_basis,active,updated_at from retention_policies where data_class=$1`,
      [dataClass],
    );
    return rows[0] ?? null;
  }

  private cutoff(policy: RetentionPolicyRow): Date {
    if (!policy.retention_days) throw new ConflictException("Retention policy has no period configured");
    return new Date(Date.now() - policy.retention_days * 86_400_000);
  }

  async preview(principal: Principal, dataClass: string) {
    await this.requireAdmin(principal);
    this.assertClass(dataClass);
    const executor = EXECUTORS[dataClass];
    if (!executor) throw new ConflictException(NON_AUTOMATIC_REASON[dataClass] ?? "Automatic retention is not enabled for this class");

    const policy = await this.loadPolicy(dataClass);
    if (!policy) throw new ConflictException("Retention policy is not configured for this class");
    const { rows } = await this.db.query<{ total: number }>(executor.countSql, [this.cutoff(policy)]);
    return {
      dataClass,
      retentionDays: policy.retention_days,
      cutoffAt: this.cutoff(policy).toISOString(),
      eligible: Number(rows[0]?.total ?? 0),
      automatic: true,
    };
  }

  async execute(principal: Principal, dataClass: string) {
    const user = await this.requireAdmin(principal);
    this.assertClass(dataClass);
    const result = await this.run(dataClass, "execute", user.id);
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "retention.run.execute",
      resourceType: "retention_run",
      resourceId: result.runId,
      metadata: { dataClass, scanned: result.scanned, affected: result.affected },
    });
    return result;
  }

  /** Worker entry point: no human actor, same guardrails. */
  async executeScheduled(dataClass: RetentionDataClass) {
    return this.run(dataClass, "execute", null);
  }

  private async run(dataClass: RetentionDataClass, mode: "execute", performedByUserId: string | null) {
    const executor = EXECUTORS[dataClass];
    if (!executor) throw new ConflictException(NON_AUTOMATIC_REASON[dataClass] ?? "Automatic retention is not enabled for this class");

    const policy = await this.loadPolicy(dataClass);
    if (!policy) throw new ConflictException("Retention policy is not configured for this class");
    if (!policy.active) throw new ConflictException("Retention policy is not active");
    if (!policy.legal_basis) throw new ConflictException("Retention policy has no legal basis");
    const cutoff = this.cutoff(policy);

    let runId: string;
    try {
      const inserted = await this.db.query<{ id: string }>(
        `insert into retention_runs(policy_id,data_class,mode,status,cutoff_at,performed_by_user_id)
         values ($1,$2,$3,'running',$4,$5) returning id`,
        [policy.id, dataClass, mode, cutoff, performedByUserId],
      );
      runId = inserted.rows[0].id;
    } catch (error) {
      // Unique partial index: one execution per data class at a time.
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException("A retention run for this data class is already in progress");
      }
      throw error;
    }

    let scanned = 0;
    let affected = 0;
    try {
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const processed = await this.db.tx(async (client) => {
          const { rows } = await client.query<{ id: string }>(executor.eligibleSql, [cutoff, BATCH_SIZE]);
          if (!rows.length) return 0;
          const ids = rows.map((row) => row.id);
          const mutated = await client.query(executor.mutateSql, [ids]);
          await client.query(
            `insert into retention_deletion_log(run_id,policy_id,data_class,object_type,object_id,action,details)
             select $1,$2,$3,$4,id,$5,$6::jsonb from unnest($7::uuid[]) as id`,
            [
              runId,
              policy.id,
              dataClass,
              executor.objectType,
              policy.action,
              JSON.stringify({ cutoffAt: cutoff.toISOString(), retentionDays: policy.retention_days }),
              ids,
            ],
          );
          return mutated.rowCount ?? 0;
        });
        scanned += processed;
        affected += processed;
        if (processed < BATCH_SIZE) break;
      }

      await this.db.query(
        `update retention_runs set status='completed',scanned=$2,affected=$3,finished_at=now() where id=$1`,
        [runId, scanned, affected],
      );
    } catch (error) {
      this.logger.error(`Retention run ${runId} for ${dataClass} failed`);
      await this.db.query(
        `update retention_runs set status='failed',scanned=$2,affected=$3,error_code='execution_failed',finished_at=now() where id=$1`,
        [runId, scanned, affected],
      ).catch(() => undefined);
      throw error;
    }

    return { runId, dataClass, scanned, affected, cutoffAt: cutoff.toISOString() };
  }

  async listRuns(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query(
      `select id,data_class,mode,status,cutoff_at,scanned,affected,error_code,started_at,finished_at
       from retention_runs order by started_at desc limit 50`,
    );
    return rows.map((row) => ({
      id: row.id,
      dataClass: row.data_class,
      mode: row.mode,
      status: row.status,
      cutoffAt: row.cutoff_at ? new Date(row.cutoff_at).toISOString() : null,
      scanned: Number(row.scanned),
      affected: Number(row.affected),
      errorCode: row.error_code,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    }));
  }
}
