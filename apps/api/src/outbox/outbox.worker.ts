import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
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

/**
 * Transactional outbox worker.
 *
 * Delivery model: at-least-once, safe with multiple worker instances.
 *
 * Transaction strategy (important for PostgreSQL):
 *  - A SHORT transaction claims a batch with `FOR UPDATE SKIP LOCKED`.
 *    Concurrent workers therefore never pick the same rows.
 *  - Each event is then processed in its OWN transaction. A failure in one
 *    event aborts only that event's transaction, so its `attempts` counter can
 *    still be incremented in a fresh transaction, and other events in the
 *    batch are unaffected.
 *  - `published_at` is set only after notifications were inserted successfully.
 *  - Duplicate notifications are prevented by `notifications.dedupe_key`
 *    (partial unique index), so re-processing a claimed event is harmless.
 *  - If the process crashes after claim but before publish, rows remain
 *    unpublished (the claim lock is released on disconnect) and are retried.
 *
 * Medical text (complaints/anamnesis/assessment/recommendations) is never
 * copied into a notification payload.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
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

  /**
   * Claim a batch in a short transaction. The row locks are held only for the
   * duration of this transaction; `SKIP LOCKED` makes concurrent workers skip
   * rows that another worker is already claiming.
   */
  private async claimBatch(): Promise<OutboxRow[]> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<OutboxRow>(
        `select id,aggregate_type,aggregate_id,event_type,payload,attempts
         from outbox_events
         where published_at is null and attempts < $1
         order by created_at
         limit $2
         for update skip locked`,
        [MAX_ATTEMPTS, BATCH_SIZE],
      );
      return rows;
    });
  }

  /**
   * Process one event in its own transaction.
   * On failure the transaction rolls back, then a separate transaction records
   * the attempt increment, so the event is retried later instead of being lost.
   */
  private async processEvent(event: OutboxRow): Promise<boolean> {
    try {
      await this.db.tx(async (client) => {
        const intents = await this.buildNotifications(client, event);
        for (const intent of intents) {
          await client.query(
            `insert into notifications(user_id,patient_profile_id,appointment_id,type,title,body,payload,dedupe_key)
             values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
             on conflict (user_id,dedupe_key) do nothing`,
            [
              intent.userId,
              intent.patientProfileId,
              intent.appointmentId,
              intent.type,
              intent.title,
              intent.body,
              JSON.stringify(intent.payload),
              intent.dedupeKey,
            ],
          );
        }
        await client.query(`update outbox_events set published_at=now(), attempts=attempts+1 where id=$1`, [event.id]);
      });
      return true;
    } catch (error) {
      // Separate transaction: the previous one is aborted and cannot be reused.
      await this.recordFailure(event.id);
      this.logger.error(`Failed to process outbox event ${event.id} (${event.event_type})`);
      return false;
    }
  }

  /** Record a failed attempt without marking the event published. */
  private async recordFailure(eventId: string): Promise<void> {
    try {
      await this.db.query(`update outbox_events set attempts=attempts+1 where id=$1`, [eventId]);
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
