import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type {
  CreateIncidentDto,
  IncidentNoteDto,
  IncidentStatusDto,
  UpdateIncidentDto,
} from "./security-incidents.dto";

type IncidentRow = {
  id: string;
  detected_at: Date;
  incident_type: string;
  severity: string;
  status: string;
  title: string;
  summary: string | null;
  affected_systems: string[];
  affected_data_classes: string[];
  affected_users_count: number | null;
  investigator_user_id: string | null;
  containment_actions: string | null;
  reporting_deadline: Date | null;
  regulator_notified_at: Date | null;
  regulator_reference: string | null;
  final_report: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
};

type IncidentEventRow = {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  occurred_at: Date;
  note: string | null;
};

const INCIDENT_COLUMNS = `id,detected_at,incident_type,severity,status,title,summary,affected_systems,
  affected_data_classes,affected_users_count,investigator_user_id,containment_actions,
  reporting_deadline,regulator_notified_at,regulator_reference,final_report,
  created_by_user_id,created_at,updated_at`;

@Injectable()
export class SecurityIncidentsService {
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

  private map(row: IncidentRow) {
    return {
      id: row.id,
      detectedAt: new Date(row.detected_at).toISOString(),
      incidentType: row.incident_type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      summary: row.summary,
      affectedSystems: row.affected_systems,
      affectedDataClasses: row.affected_data_classes,
      affectedUsersCount: row.affected_users_count,
      investigatorUserId: row.investigator_user_id,
      containmentActions: row.containment_actions,
      reportingDeadline: row.reporting_deadline ? new Date(row.reporting_deadline).toISOString() : null,
      regulatorNotifiedAt: row.regulator_notified_at ? new Date(row.regulator_notified_at).toISOString() : null,
      regulatorReference: row.regulator_reference,
      finalReport: row.final_report,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async create(principal: Principal, input: CreateIncidentDto) {
    const user = await this.requireAdmin(principal);
    const row = await this.db.tx(async (client) => {
      const inserted = await client.query<IncidentRow>(
        `insert into security_incidents(
           detected_at,incident_type,severity,status,title,summary,affected_systems,affected_data_classes,
           affected_users_count,reporting_deadline,created_by_user_id)
         values (coalesce($1::timestamptz,now()),$2,$3,'open',$4,$5,$6::text[],$7::text[],$8,$9::timestamptz,$10)
         returning ${INCIDENT_COLUMNS}`,
        [
          input.detectedAt ?? null,
          input.incidentType,
          input.severity,
          input.title,
          input.summary ?? null,
          input.affectedSystems ?? [],
          input.affectedDataClasses ?? [],
          input.affectedUsersCount ?? null,
          input.reportingDeadline ?? null,
          user.id,
        ],
      );
      await client.query(
        `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
         values ($1,'detected',$2,$3)`,
        [inserted.rows[0].id, user.id, "Incident registered"],
      );
      return inserted.rows[0];
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "security_incident.create",
      resourceType: "security_incident",
      resourceId: row.id,
      metadata: { severity: row.severity, incidentType: row.incident_type },
    });
    return this.map(row);
  }

  async list(principal: Principal, status?: string) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query<IncidentRow>(
      `select ${INCIDENT_COLUMNS} from security_incidents
       where ($1::text is null or status=$1)
       order by detected_at desc limit 100`,
      [status ?? null],
    );
    return rows.map((row) => this.map(row));
  }

  async get(principal: Principal, id: string) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query<IncidentRow>(
      `select ${INCIDENT_COLUMNS} from security_incidents where id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("Incident not found");
    const events = await this.db.query<IncidentEventRow>(
      `select id,event_type,actor_user_id,occurred_at,note from security_incident_events
       where incident_id=$1 order by occurred_at`,
      [id],
    );
    return {
      ...this.map(rows[0]),
      events: events.rows.map((event) => ({
        id: event.id,
        type: event.event_type,
        actorUserId: event.actor_user_id,
        occurredAt: new Date(event.occurred_at).toISOString(),
        note: event.note,
      })),
    };
  }

  async update(principal: Principal, id: string, input: UpdateIncidentDto) {
    const user = await this.requireAdmin(principal);
    const row = await this.db.tx(async (client) => {
      const existing = await client.query<IncidentRow>(
        `select ${INCIDENT_COLUMNS} from security_incidents where id=$1 for update`,
        [id],
      );
      if (!existing.rows[0]) throw new NotFoundException("Incident not found");

      const updated = await client.query<IncidentRow>(
        `update security_incidents set
           title=coalesce($2,title),
           summary=coalesce($3,summary),
           severity=coalesce($4,severity),
           affected_systems=coalesce($5::text[],affected_systems),
           affected_data_classes=coalesce($6::text[],affected_data_classes),
           affected_users_count=coalesce($7,affected_users_count),
           investigator_user_id=coalesce($8,investigator_user_id),
           containment_actions=coalesce($9,containment_actions),
           reporting_deadline=coalesce($10::timestamptz,reporting_deadline),
           regulator_notified_at=coalesce($11::timestamptz,regulator_notified_at),
           regulator_reference=coalesce($12,regulator_reference),
           final_report=coalesce($13,final_report),
           updated_at=now()
         where id=$1
         returning ${INCIDENT_COLUMNS}`,
        [
          id,
          input.title ?? null,
          input.summary ?? null,
          input.severity ?? null,
          input.affectedSystems ?? null,
          input.affectedDataClasses ?? null,
          input.affectedUsersCount ?? null,
          input.investigatorUserId ?? null,
          input.containmentActions ?? null,
          input.reportingDeadline ?? null,
          input.regulatorNotifiedAt ?? null,
          input.regulatorReference ?? null,
          input.finalReport ?? null,
        ],
      );

      if (input.containmentActions) {
        await client.query(
          `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
           values ($1,'containment',$2,$3)`,
          [id, user.id, input.note ?? "Containment actions recorded"],
        );
      }
      if (input.regulatorNotifiedAt) {
        await client.query(
          `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
           values ($1,'notified',$2,$3)`,
          [id, user.id, input.regulatorReference ?? null],
        );
      }
      if (input.finalReport) {
        await client.query(
          `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
           values ($1,'report_attached',$2,$3)`,
          [id, user.id, null],
        );
      }
      if (input.note) {
        await client.query(
          `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
           values ($1,'note',$2,$3)`,
          [id, user.id, input.note],
        );
      }
      return updated.rows[0];
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "security_incident.update",
      resourceType: "security_incident",
      resourceId: id,
      metadata: { fields: Object.keys(input).filter((key) => key !== "note") },
    });
    return this.map(row);
  }

  async updateStatus(principal: Principal, id: string, input: IncidentStatusDto) {
    const user = await this.requireAdmin(principal);
    const row = await this.db.tx(async (client) => {
      const updated = await client.query<IncidentRow>(
        `update security_incidents set status=$2,updated_at=now() where id=$1 returning ${INCIDENT_COLUMNS}`,
        [id, input.status],
      );
      if (!updated.rows[0]) throw new NotFoundException("Incident not found");
      await client.query(
        `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
         values ($1,'status_changed',$2,$3)`,
        [id, user.id, input.note ?? input.status],
      );
      return updated.rows[0];
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "security_incident.status",
      resourceType: "security_incident",
      resourceId: id,
      metadata: { status: input.status },
    });
    return this.map(row);
  }

  async addNote(principal: Principal, id: string, input: IncidentNoteDto) {
    const user = await this.requireAdmin(principal);
    const exists = await this.db.query<{ id: string }>(`select id from security_incidents where id=$1`, [id]);
    if (!exists.rows[0]) throw new NotFoundException("Incident not found");
    await this.db.tx(async (client) => {
      await client.query(
        `insert into security_incident_events(incident_id,event_type,actor_user_id,note)
         values ($1,'note',$2,$3)`,
        [id, user.id, input.note],
      );
      await client.query(`update security_incidents set updated_at=now() where id=$1`, [id]);
    });
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "security_incident.note",
      resourceType: "security_incident",
      resourceId: id,
    });
    return { ok: true };
  }
}
