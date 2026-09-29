import { Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";

@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async record(input: {
    actorUserId?: string | null;
    actorSubject?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome?: "success" | "denied" | "error";
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    await this.db.query(
      `insert into audit_events(actor_user_id,actor_subject,action,resource_type,resource_id,outcome,request_id,metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        input.actorUserId ?? null,
        input.actorSubject ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.outcome ?? "success",
        input.requestId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
