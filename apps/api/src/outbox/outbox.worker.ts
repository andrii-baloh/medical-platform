import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { DbService } from "../db/db.service";

/** Row shape of an outbox event selected for processing. */
type OutboxRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

/** Appointment facts needed to build a notification, without medical text. */
type AppointmentFacts = {
  appointment_id: string;
  patient_profile_id: string;
  doctor_id: string;
  doctor_user_id: string | null;
  patient_user_id: string;
};

/** Minimal notification to insert, derived from a domain event. */
type NotificationIntent = {
  userId: string;
  patientProfileId: string | null;
  appointmentId: string | null;
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
};

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 20);
const MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 10);
const CLAIM_TTL_SECONDS = Number(process.env.OUTBOX_CLAIM_TTL_SECONDS ?? 120);

/**
 * Transactional outbox worker.
 *
 * Delivery model: at-least-once, safe with multiple worker instances.
 *
 * Transaction strategy (important for PostgreSQL):
 *  - A short transaction atomically leases a batch with `FOR UPDATE SKIP LOCKED`
 *    plus `claimed_by`/`claim_expires_at`, so the lease survives commit.
 *  - Each event is then processed in its own transaction. A failure in one
 *    event aborts only that event's transaction, then a fresh statement records
 *    the failed attempt and releases this worker's lease.
 *  - `published_at` is set only after notifications were inserted successfully.
 *  - Duplicate notifications are prevented by `notifications.dedupe_key`, so
 *    at-least-once retries cannot create duplicate user notifications.
 *  - If a worker crashes after claim, the lease expires and another worker can
 *    safely reclaim the still-unpublished event.
 *
 * Medical text (complaints/anamnesis/assessment/recommendations) is never
 * copied into a notification payload.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly workerId = `api-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DbService) {}

  onModuleInit() {
    if ((process.env.OUTBOX_WORKER_ENABLED ?? "true") !== "true") {
      this.logger.log("Outbox worker disabled by configuration");
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.logger.log(`Outbox worker started (interval ${POLL_INTERVAL_MS}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One polling cycle. Returns how many events were published.
   * Exposed for tests and manual invocation.
   */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      let published = 0;
      for (const event of claimed) {
        if (await this.processEvent(event)) published += 1;
      }
      return published;
    } catch (error) {
      this.logger.error("Outbox polling cycle failed");
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Atomically lease a batch so another worker cannot process it concurrently. */
  private async claimBatch(): Promise<OutboxRow[]> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<OutboxRow>(
        `with candidates as (
           select id
           from outbox_events
           where published_at is null
             and attempts < $1
             and (claim_expires_at is null or claim_expires_at < now())
           order by created_at
           limit $2
           for update skip locked
         )
         update outbox_events o
         set claimed_at = now(),
             claimed_by = $3,
             claim_expires_at = now() + ($4::int * interval '1 second')
         from candidates c
         where o.id = c.id
         returning o.id,o.aggregate_type,o.aggregate_id,o.event_type,o.payload,o.attempts`,
        [MAX_ATTEMPTS, BATCH_SIZE, this.workerId, CLAIM_TTL_SECONDS],
      );
      return rows;
    });
  }

  /** Process one leased event in its own transaction. */
  private async processEvent(event: OutboxRow): Promise<boolean> {
    try {
      return await this.db.tx(async (client) => {
        const { rows } = await client.query<OutboxRow>(
          `select id,aggregate_type,aggregate_id,event_type,payload,attempts
           from outbox_events
           where id=$1 and published_at is null and claimed_by=$2
           for update`,
          [event.id, this.workerId],
        );
        const current = rows[0];
        if (!current) return false;

        const intents = await this.buildNotifications(client, current);
        for (const intent of intents) {
          await client.query(
            `insert into notifications(user_id,patient_profile_id,appointment_id,type,title,body,payload,dedupe_key)
             values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
             on conflict do nothing`,
            [intent.userId,intent.patientProfileId,intent.appointmentId,intent.type,intent.title,intent.body,JSON.stringify(intent.payload),intent.dedupeKey],
          );
        }
        await client.query(
          `update outbox_events
           set published_at=now(), attempts=attempts+1,
               claimed_at=null, claimed_by=null, claim_expires_at=null
           where id=$1 and claimed_by=$2`,
          [event.id, this.workerId],
        );
        return true;
      });
    } catch (error) {
      await this.recordFailure(event.id);
      this.logger.error(`Failed to process outbox event ${event.id} (${event.event_type})`);
      return false;
    }
  }

  /** Record a failed attempt and release this worker's lease. */
  private async recordFailure(eventId: string): Promise<void> {
    try {
      await this.db.query(
        `update outbox_events
         set attempts=attempts+1,
             claimed_at=null, claimed_by=null, claim_expires_at=null
         where id=$1 and published_at is null and claimed_by=$2`,
        [eventId, this.workerId],
      );
    } catch (error) {
      this.logger.error(`Failed to record attempt for outbox event ${eventId}`);
    }
  }

  /** Translate a domain event into zero or more notification intents. */
  private async buildNotifications(client: PoolClient, event: OutboxRow): Promise<NotificationIntent[]> {
    const appointmentId = (event.payload.appointmentId as string) ?? event.aggregate_id ?? null;
    if (!appointmentId) return [];

    const { rows } = await client.query<AppointmentFacts>(
      `select a.id appointment_id, a.patient_profile_id, a.doctor_id,
              d.account_user_id doctor_user_id,
              p.owner_user_id patient_user_id
       from appointments a
       join doctor_profiles d on d.id = a.doctor_id
       join patient_profiles p on p.id = a.patient_profile_id
       where a.id = $1`,
      [appointmentId],
    );
    const appt = rows[0];
    if (!appt) return [];

    const intents: NotificationIntent[] = [];
    const base = { patientProfileId: appt.patient_profile_id, appointmentId };

    switch (event.event_type) {
      case "appointment.confirmed":
        intents.push({
          ...base,
          userId: appt.patient_user_id,
          type: event.event_type,
          title: "Запись подтверждена",
          body: "Ваша запись на консультацию подтверждена.",
          dedupeKey: `${event.event_type}:${appointmentId}`,
          payload: { appointmentId },
        });
        if (appt.doctor_user_id) {
          intents.push({
            ...base,
            userId: appt.doctor_user_id,
            type: event.event_type,
            title: "Новая запись",
            body: "У вас новая запись на консультацию.",
            dedupeKey: `${event.event_type}:doctor:${appointmentId}`,
            payload: { appointmentId },
          });
        }
        break;

      case "appointment.cancelled": {
        const by = (event.payload.by as string) ?? "unknown";
        if (by !== "patient") {
          intents.push({
            ...base,
            userId: appt.patient_user_id,
            type: event.event_type,
            title: "Консультация отменена",
            body: "Запись на консультацию была отменена.",
            dedupeKey: `${event.event_type}:patient:${appointmentId}`,
            payload: { appointmentId, by },
          });
        }
        if (by !== "doctor" && appt.doctor_user_id) {
          intents.push({
            ...base,
            userId: appt.doctor_user_id,
            type: event.event_type,
            title: "Пациент отменил запись",
            body: "Пациент отменил запись на консультацию.",
            dedupeKey: `${event.event_type}:doctor:${appointmentId}`,
            payload: { appointmentId, by },
          });
        }
        break;
      }

      case "consultation.signed": {
        const version = (event.payload.version as number) ?? 1;
        intents.push({
          ...base,
          userId: appt.patient_user_id,
          type: event.event_type,
          title: "Врач подготовил заключение",
          body: "Заключение по консультации готово к просмотру.",
          dedupeKey: `consultation-signed:${appointmentId}:${version}`,
          payload: { appointmentId, version },
        });
        break;
      }

      case "appointment.completed":
        // Reserved for a future patient-facing completion notice.
        break;

      default:
        break;
    }
    return intents;
  }
}
