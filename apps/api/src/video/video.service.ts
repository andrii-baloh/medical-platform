import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import { VIDEO_PROVIDER, type VideoParticipantRole, type VideoProvider } from "./video.provider";

/** How long a join token stays valid. */
const TOKEN_TTL_SECONDS = Number(process.env.VIDEO_TOKEN_TTL_SECONDS ?? 900);
/** The room may be joined this many minutes before the slot starts. */
const JOIN_OPENS_MINUTES_BEFORE = Number(process.env.VIDEO_JOIN_OPENS_MINUTES ?? 15);
/** The room may be joined this many minutes after the slot ends. */
const JOIN_CLOSES_MINUTES_AFTER = Number(process.env.VIDEO_JOIN_CLOSES_MINUTES ?? 30);

type Participant = {
  role: VideoParticipantRole;
  userId: string;
  displayName: string;
  appointmentId: string;
  doctorId: string;
  patientProfileId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
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
              s.starts_at, s.ends_at,
              d.account_user_id doctor_user_id, d.full_name doctor_name,
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

    if (row.doctor_user_id && row.doctor_user_id === user.id) {
      return {
        role: "doctor",
        userId: user.id,
        displayName: row.doctor_name,
        appointmentId,
        doctorId: row.doctor_id,
        patientProfileId: row.patient_profile_id,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
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
        endsAt: new Date(row.ends_at),
        status: row.status,
      };
    }
    throw new ForbiddenException("Not a participant of this appointment");
  }

  private assertJoinWindow(participant: Participant) {
    if (["cancelled_by_patient", "cancelled_by_doctor", "no_show"].includes(participant.status)) {
      throw new ConflictException("Appointment is no longer active");
    }
    const now = Date.now();
    const opensAt = participant.startsAt.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000;
    const closesAt = participant.endsAt.getTime() + JOIN_CLOSES_MINUTES_AFTER * 60_000;
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
    const roomName = `appt-${participant.appointmentId}`;
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
    return rows[0];
  }

  async issueToken(principal: Principal, appointmentId: string) {
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

    await this.audit.record({
      actorUserId: participant.userId,
      actorSubject: principal.sub,
      action: "video.token.issue",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { role: participant.role, roomId: room.id },
    });

    return {
      roomId: room.id,
      role: participant.role,
      token: issued.token,
      roomUrl: issued.roomUrl,
      expiresAt: issued.expiresAt,
      expiresInSeconds: TOKEN_TTL_SECONDS,
    };
  }

  /** Doctor closes the room; patients cannot force-close a consultation. */
  async closeRoom(principal: Principal, appointmentId: string) {
    const participant = await this.requireParticipant(principal, appointmentId);
    if (participant.role !== "doctor") throw new ForbiddenException("Only the doctor can close the room");

    const { rows } = await this.db.query(
      `select * from video_rooms where appointment_id = $1`,
      [appointmentId],
    );
    const room = rows[0];
    if (!room) throw new NotFoundException("Room not found");
    if (room.status === "closed") return { id: room.id, status: room.status };

    await this.provider.closeRoom(room.provider_room_id);
    await this.db.query(
      `update video_rooms set status='closed', closed_at=now(), updated_at=now() where id=$1`,
      [room.id],
    );
    await this.audit.record({
      actorUserId: participant.userId,
      actorSubject: principal.sub,
      action: "video.room.close",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { roomId: room.id },
    });
    return { id: room.id, status: "closed" };
  }

  /** Record a client-side join/leave so the audit trail is complete. */
  async recordEvent(principal: Principal, appointmentId: string, eventType: "joined" | "left") {
    const participant = await this.requireParticipant(principal, appointmentId);
    const { rows } = await this.db.query(
      `select id from video_rooms where appointment_id = $1`,
      [appointmentId],
    );
    if (!rows[0]) throw new NotFoundException("Room not found");
    await this.db.query(
      `insert into video_join_events(video_room_id, user_id, participant_role, event_type)
       values ($1,$2,$3,$4)`,
      [rows[0].id, participant.userId, participant.role, eventType],
    );
    return { ok: true };
  }
}
