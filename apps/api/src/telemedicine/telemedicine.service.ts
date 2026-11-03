import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PoolClient } from "pg";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";

export type TelemedicineSessionEventType =
  | "joined"
  | "left"
  | "reconnecting"
  | "connection_lost"
  | "technical_failure";

export type TelemedicineSessionStatus = "scheduled" | "waiting" | "active" | "completed" | "failed" | "cancelled";

type SessionRow = {
  id: string;
  appointment_id: string;
  encounter_id: string | null;
  video_room_id: string | null;
  provider: string;
  status: TelemedicineSessionStatus;
  technical_status: string;
  recording_status: string;
  patient_joined_at: Date | null;
  doctor_joined_at: Date | null;
  patient_left_at: Date | null;
  doctor_left_at: Date | null;
  started_at: Date | null;
  ended_at: Date | null;
  disconnect_count: number;
  created_at: Date;
  updated_at: Date;
};

type SessionEventRow = {
  event_type: string;
  actor_role: string | null;
  occurred_at: Date;
} & Record<string, unknown>;

const EVENT_COLUMN_BY_TYPE: Record<TelemedicineSessionEventType, string> = {
  joined: "participant_joined",
  left: "participant_left",
  reconnecting: "reconnecting",
  connection_lost: "connection_lost",
  technical_failure: "technical_failure",
};

/**
 * Telemedicine session: the clinical side of the LiveKit room.
 *
 * The video provider and `video_rooms` remain untouched transport concerns.
 * This service binds a room to the appointment and (once it exists) to the
 * medical encounter, keeps a session timeline and stores technical/recording
 * state without ever storing clinical text or tokens.
 */
@Injectable()
export class TelemedicineService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates the session for a freshly provisioned room, inside the room's own
   * transaction. Idempotent: a retry returns the existing session.
   */
  async ensureForRoomTx(
    client: PoolClient,
    input: { appointmentId: string; videoRoomId: string; provider: string },
  ): Promise<{ id: string; status: TelemedicineSessionStatus }> {
    const existing = await client.query<{ id: string; status: TelemedicineSessionStatus }>(
      `select id,status from telemedicine_sessions where appointment_id=$1 for update`,
      [input.appointmentId],
    );
    if (existing.rows[0]) {
      await client.query(
        `update telemedicine_sessions
         set video_room_id=coalesce(video_room_id,$2),
             encounter_id=coalesce(encounter_id,(select id from medical_encounters where appointment_id=$1)),
             updated_at=now()
         where id=$3`,
        [input.appointmentId, input.videoRoomId, existing.rows[0].id],
      );
      return existing.rows[0];
    }

    const inserted = await client.query<{ id: string; status: TelemedicineSessionStatus }>(
      `insert into telemedicine_sessions(appointment_id,encounter_id,video_room_id,provider,status)
       values ($1,(select id from medical_encounters where appointment_id=$1),$2,$3,'scheduled')
       returning id,status`,
      [input.appointmentId, input.videoRoomId, input.provider],
    );
    const session = inserted.rows[0];
    await client.query(
      `insert into telemedicine_session_events(session_id,event_type,actor_role,metadata)
       values ($1,'session_created','system',$2::jsonb)`,
      [session.id, JSON.stringify({ provider: input.provider })],
    );
    return session;
  }

  /** The room was opened by the first issued join token. */
  async markRoomOpenedTx(client: PoolClient, sessionId: string, actorUserId: string | null) {
    const { rowCount } = await client.query(
      `update telemedicine_sessions
       set status=case when status='scheduled' then 'waiting' else status end,updated_at=now()
       where id=$1 and status='scheduled'`,
      [sessionId],
    );
    if (rowCount) {
      await client.query(
        `insert into telemedicine_session_events(session_id,event_type,actor_user_id,actor_role)
         values ($1,'room_opened',$2,'system')`,
        [sessionId, actorUserId],
      );
    }
  }

  /**
   * Participant joined/left or reported a connection problem.
   *
   * Join timestamps are first-write-wins so a reconnect does not rewrite the
   * original start, while `disconnect_count` accumulates real losses.
   */
  async recordParticipantEventTx(
    client: PoolClient,
    sessionId: string,
    role: "patient" | "doctor",
    event: TelemedicineSessionEventType,
    actorUserId: string,
  ) {
    if (event === "joined") {
      const column = role === "patient" ? "patient_joined_at" : "doctor_joined_at";
      await client.query(
        `update telemedicine_sessions
         set ${column}=coalesce(${column},now()),
             started_at=coalesce(started_at,now()),
             technical_status=case when technical_status='pending' then 'ok' else technical_status end,
             status=case when status in ('scheduled','waiting') then 'active' else status end,
             updated_at=now()
         where id=$1`,
        [sessionId],
      );
    } else if (event === "left") {
      const column = role === "patient" ? "patient_left_at" : "doctor_left_at";
      await client.query(
        `update telemedicine_sessions set ${column}=now(),updated_at=now() where id=$1`,
        [sessionId],
      );
    } else {
      await client.query(
        `update telemedicine_sessions
         set disconnect_count=disconnect_count+case when $2 in ('connection_lost','technical_failure') then 1 else 0 end,
             technical_status=case when $2='technical_failure' then 'degraded' else technical_status end,
             updated_at=now()
         where id=$1`,
        [sessionId, EVENT_COLUMN_BY_TYPE[event]],
      );
    }

    await client.query(
      `insert into telemedicine_session_events(session_id,event_type,actor_user_id,actor_role)
       values ($1,$2,$3,$4)`,
      [sessionId, EVENT_COLUMN_BY_TYPE[event], actorUserId, role],
    );
  }

  /** Appointment finished: close the session even if the room was not closed. */
  async completeForAppointmentTx(
    client: PoolClient,
    appointmentId: string,
    status: Extract<TelemedicineSessionStatus, "completed" | "cancelled">,
  ) {
    const { rows } = await client.query<{ id: string }>(
      `update telemedicine_sessions
       set status=$2,
           ended_at=coalesce(ended_at,now()),updated_at=now()
       where appointment_id=$1 and status not in ('completed','cancelled')
       returning id`,
      [appointmentId, status],
    );
    if (rows[0]) {
      await client.query(
        `insert into telemedicine_session_events(session_id,event_type,actor_role)
         values ($1,$2,'system')`,
        [rows[0].id, status === "cancelled" ? "session_cancelled" : "session_completed"],
      );
    }
  }

  private async requireParticipant(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<{
      appointment_id: string;
      doctor_user_id: string | null;
      doctor_verified: boolean;
      patient_owner_user_id: string;
    }>(
      `select a.id appointment_id,
              d.account_user_id doctor_user_id, d.verified doctor_verified,
              p.owner_user_id patient_owner_user_id
       from appointments a
       join doctor_profiles d on d.id=a.doctor_id
       join patient_profiles p on p.id=a.patient_profile_id
       where a.id=$1`,
      [appointmentId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Appointment not found");
    const isDoctor = Boolean(row.doctor_user_id) && row.doctor_user_id === user.id && row.doctor_verified;
    const isPatient = row.patient_owner_user_id === user.id;
    if (!isDoctor && !isPatient) throw new ForbiddenException("Not a participant of this appointment");
    return { user, role: (isDoctor ? "doctor" : "patient") as "doctor" | "patient" };
  }

  /** Patient and doctor read model. Returns null when the session has not started. */
  async getForAppointment(principal: Principal, appointmentId: string) {
    await this.requireParticipant(principal, appointmentId);
    const { rows } = await this.db.query<SessionRow>(
      `select id,appointment_id,encounter_id,video_room_id,provider,status,technical_status,recording_status,
              patient_joined_at,doctor_joined_at,patient_left_at,doctor_left_at,started_at,ended_at,
              disconnect_count,created_at,updated_at
       from telemedicine_sessions where appointment_id=$1`,
      [appointmentId],
    );
    const session = rows[0];
    if (!session) return null;

    const events = await this.db.query<SessionEventRow>(
      `select event_type,actor_role,occurred_at
       from telemedicine_session_events
       where session_id=$1
       order by occurred_at desc
       limit 50`,
      [session.id],
    );

    return {
      id: session.id,
      appointmentId: session.appointment_id,
      encounterId: session.encounter_id,
      videoRoomId: session.video_room_id,
      provider: session.provider,
      status: session.status,
      technicalStatus: session.technical_status,
      recordingStatus: session.recording_status,
      patientJoinedAt: session.patient_joined_at?.toISOString() ?? null,
      doctorJoinedAt: session.doctor_joined_at?.toISOString() ?? null,
      startedAt: session.started_at?.toISOString() ?? null,
      endedAt: session.ended_at?.toISOString() ?? null,
      disconnectCount: session.disconnect_count,
      events: events.rows.map((event) => ({
        type: event.event_type,
        role: event.actor_role,
        occurredAt: new Date(event.occurred_at).toISOString(),
      })),
    };
  }

  /**
   * Doctor-side technical report: a lost connection or a failed device.
   * The client cannot forge a "joined" state through this method.
   */
  async reportConnectionIssue(
    principal: Principal,
    appointmentId: string,
    event: "reconnecting" | "connection_lost" | "technical_failure",
  ) {
    const participant = await this.requireParticipant(principal, appointmentId);
    const { rows } = await this.db.query<{ id: string }>(
      `select id from telemedicine_sessions where appointment_id=$1`,
      [appointmentId],
    );
    const session = rows[0];
    if (!session) throw new NotFoundException("Telemedicine session has not started");

    await this.db.tx((client) =>
      this.recordParticipantEventTx(client, session.id, participant.role, event, participant.user.id),
    );
    await this.audit.record({
      actorUserId: participant.user.id,
      actorSubject: principal.sub,
      action: "telemedicine.session.connection_issue",
      resourceType: "telemedicine_session",
      resourceId: session.id,
      metadata: { appointmentId, event, role: participant.role },
    });
    return { ok: true };
  }
}
