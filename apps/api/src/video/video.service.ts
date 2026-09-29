import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import { VIDEO_PROVIDER, type VideoParticipantRole, type VideoProvider } from "./video.provider";

/** Join token lifetime. Short-lived by design; never persisted. */
const TOKEN_TTL_SECONDS = Number(process.env.VIDEO_TOKEN_TTL_SECONDS ?? 900);
/** The room may be joined this many minutes before the appointment starts. */
const JOIN_EARLY_MINUTES = Number(process.env.VIDEO_JOIN_EARLY_MINUTES ?? 15);
/** The room may be joined this many minutes after the appointment starts. */
const JOIN_AFTER_START_MINUTES = Number(process.env.VIDEO_JOIN_AFTER_START_MINUTES ?? 120);

const INACTIVE_STATUSES = ["cancelled_by_patient", "cancelled_by_doctor", "no_show"];

type Participant = {
  role: VideoParticipantRole;
  userId: string;
  displayName: string;
  appointmentId: string;
  doctorId: string;
  patientProfileId: string;
  startsAt: Date;
  status: string;
};

export type VideoJoinResult = {
  provider: string;
  roomUrl: string;
  token: string;
  expiresAt: string;
  appointmentId: string;
  roomStatus: string;
  role: VideoParticipantRole;
};

@Injectable()
export class VideoService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
  ) {}

  /** Resolve the caller as a participant of the appointment, or deny. */
  private async requireParticipant(principal: Principal, appointmentId: string): Promise<Participant> {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select a.id appointment_id, a.doctor_id, a.patient_profile_id, a.status,
              s.starts_at,
              d.account_user_id doctor_user_id, d.full_name doctor_name, d.verified doctor_verified,
              p.owner_user_id patient_owner_user_id, p.full_name patient_name
       from appointments a
       join appointment_slots s on s.id = a.slot_id
       join doctor_profiles d on d.id = a.doctor_id
       join patient_profiles p on p.id = a.patient_profile_id
       where a.id = $1`,
      [appointmentId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Appointment not found");

    if (row.doctor_user_id && row.doctor_user_id === user.id && row.doctor_verified) {
      return {
        role: "doctor",
        userId: user.id,
        displayName: row.doctor_name,
        appointmentId,
        doctorId: row.doctor_id,
        patientProfileId: row.patient_profile_id,
        startsAt: new Date(row.starts_at),
        status: row.status,
      };
    }
    if (row.patient_owner_user_id === user.id) {
      return {
        role: "patient",
        userId: user.id,
        displayName: row.patient_name,
        appointmentId,
        doctorId: row.doctor_id,
        patientProfileId: row.patient_profile_id,
        startsAt: new Date(row.starts_at),
        status: row.status,
      };
    }
    throw new ForbiddenException("Not a participant of this appointment");
  }

  /**
   * The join window is enforced on the backend for every role.
   * Frontend may hide the button, but this check is authoritative.
   */
  private assertJoinWindow(participant: Participant) {
    if (INACTIVE_STATUSES.includes(participant.status)) {
      throw new ConflictException("Appointment is no longer active");
    }
    const now = Date.now();
    const startsAt = participant.startsAt.getTime();
    const opensAt = startsAt - JOIN_EARLY_MINUTES * 60_000;
    const closesAt = startsAt + JOIN_AFTER_START_MINUTES * 60_000;
    if (now < opensAt) throw new ConflictException("The consultation room is not open yet");
    if (now > closesAt) throw new ConflictException("The consultation room is closed");
  }

  /** Get or create the single room bound to this appointment. */
  private async ensureRoom(participant: Participant) {
    const { rows: existing } = await this.db.query(
      `select * from video_rooms where appointment_id = $1`,
      [participant.appointmentId],
    );
    if (existing[0]) {
      if (existing[0].status === "closed") throw new ConflictException("The consultation room is closed");
      return existing[0];
    }
    // Technical room name only: no patient name, no FIO, no raw appointment id.
    const roomName = `med-${randomUUID()}`;
    const created = await this.provider.createRoom({ roomName, appointmentId: participant.appointmentId });
    const { rows } = await this.db.query(
      `insert into video_rooms(appointment_id, provider, provider_room_id, room_name, status, metadata)
       values ($1,$2,$3,$4,'planned',$5::jsonb)
       on conflict (appointment_id) do update set updated_at = now()
       returning *`,
      [
        participant.appointmentId,
        this.provider.name,
        created.providerRoomId,
        roomName,
        JSON.stringify(created.metadata ?? {}),
      ],
    );
    await this.audit.record({
      actorUserId: participant.userId,
      actorSubject: null,
      action: "video.room.create",
      resourceType: "appointment",
      resourceId: participant.appointmentId,
      metadata: { appointmentId: participant.appointmentId, participantRole: participant.role, provider: this.provider.name },
    });
    return rows[0];
  }

  async join(principal: Principal, appointmentId: string): Promise<VideoJoinResult> {
    const participant = await this.requireParticipant(principal, appointmentId);
    this.assertJoinWindow(participant);
    const room = await this.ensureRoom(participant);

    const issued = await this.provider.issueToken({
      providerRoomId: room.provider_room_id,
      role: participant.role,
      participantId: participant.userId,
      displayName: participant.displayName,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });

    const roomStatus = room.status === "planned" ? "active" : room.status;
    await this.db.tx(async (client) => {
      if (room.status === "planned") {
        await client.query(
          `update video_rooms set status='active', opened_at=coalesce(opened_at, now()), updated_at=now() where id=$1`,
          [room.id],
        );
      }
      await client.query(
        `insert into video_join_events(video_room_id, user_id, participant_role, event_type, metadata)
         values ($1,$2,$3,'token_issued',$4::jsonb)`,
        [room.id, participant.userId, participant.role, JSON.stringify({ expiresAt: issued.expiresAt })],
      );
    });

    // The token itself is never written to audit_events, logs or the database.
    await this.audit.record({
      actorUserId: participant.userId,
      actorSubject: principal.sub,
      action: "video.token.issue",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { appointmentId, participantRole: participant.role, provider: this.provider.name },
    });

    return {
      provider: this.provider.name,
      roomUrl: issued.roomUrl,
      token: issued.token,
      expiresAt: issued.expiresAt,
      appointmentId,
      roomStatus,
      role: participant.role,
    };
  }

  /** Doctor closes the room; patients cannot force-close a consultation. */
  async closeRoom(principal: Principal, appointmentId: string) {
    const participant = await this.requireParticipant(principal, appointmentId);
    if (participant.role !== "doctor") throw new ForbiddenException("Only the doctor can close the room");

    const { rows } = await this.db.query(`select * from video_rooms where appointment_id = $1`, [appointmentId]);
    const room = rows[0];
    if (!room) throw new NotFoundException("Room not found");
    if (room.status === "closed") return { id: room.id, status: room.status };

    await this.provider.closeRoom(room.provider_room_id);
    await this.db.query(`update video_rooms set status='closed', closed_at=now(), updated_at=now() where id=$1`, [room.id]);
    await this.audit.record({
      actorUserId: participant.userId,
      actorSubject: principal.sub,
      action: "video.room.close",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { appointmentId, participantRole: participant.role, provider: this.provider.name },
    });
    return { id: room.id, status: "closed" };
  }

  /** Record a client-side join/leave so the audit trail is complete. */
  async recordEvent(principal: Principal, appointmentId: string, eventType: "joined" | "left") {
    const participant = await this.requireParticipant(principal, appointmentId);
    const { rows } = await this.db.query(`select id from video_rooms where appointment_id = $1`, [appointmentId]);
    if (!rows[0]) throw new NotFoundException("Room not found");
    await this.db.query(
      `insert into video_join_events(video_room_id, user_id, participant_role, event_type)
       values ($1,$2,$3,$4)`,
      [rows[0].id, participant.userId, participant.role, eventType],
    );
    return { ok: true };
  }
}
