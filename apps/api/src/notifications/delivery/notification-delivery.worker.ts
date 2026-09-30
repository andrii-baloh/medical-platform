import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "../../db/db.service";
import { NOTIFICATION_EMAIL_PROVIDER, type NotificationEmailProvider } from "./notification-delivery.provider";

type DeliveryRow = {
  id: string;
  notification_id: string;
  user_id: string;
  attempts: number;
};

type DeliveryPayload = {
  id: string;
  notification_id: string;
  user_id: string;
  email: string | null;
  title: string;
  body: string;
};

const POLL_INTERVAL_MS = Number(process.env.NOTIFICATION_DELIVERY_POLL_INTERVAL_MS ?? 5000);
const BATCH_SIZE = Number(process.env.NOTIFICATION_DELIVERY_BATCH_SIZE ?? 20);
const MAX_ATTEMPTS = Number(process.env.NOTIFICATION_DELIVERY_MAX_ATTEMPTS ?? 8);
const CLAIM_TTL_SECONDS = Number(process.env.NOTIFICATION_DELIVERY_CLAIM_TTL_SECONDS ?? 120);

@Injectable()
export class NotificationDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private readonly workerId = `notification-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DbService,
    @Inject(NOTIFICATION_EMAIL_PROVIDER) private readonly provider: NotificationEmailProvider,
  ) {}

  onModuleInit() {
    if ((process.env.NOTIFICATION_DELIVERY_WORKER_ENABLED ?? "false") !== "true") {
      this.logger.log("Notification delivery worker disabled by configuration");
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.logger.log(`Notification delivery worker started (${this.provider.name})`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      let sent = 0;
      for (const job of claimed) {
        if (await this.process(job)) sent += 1;
      }
      return sent;
    } catch {
      this.logger.error("Notification delivery polling cycle failed");
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<DeliveryRow[]> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<DeliveryRow>(
        `with candidates as (
           select id
           from notification_deliveries
           where status in ('pending','failed','sending')
             and attempts < $1
             and (claim_expires_at is null or claim_expires_at < now())
           order by created_at
           limit $2
           for update skip locked
         )
         update notification_deliveries d
         set status='sending',claimed_at=now(),claimed_by=$3,
             claim_expires_at=now()+($4::int * interval '1 second'),updated_at=now()
         from candidates c
         where d.id=c.id
         returning d.id,d.notification_id,d.user_id,d.attempts`,
        [MAX_ATTEMPTS, BATCH_SIZE, this.workerId, CLAIM_TTL_SECONDS],
      );
      return rows;
    });
  }

  private async process(job: DeliveryRow): Promise<boolean> {
    try {
      const { rows } = await this.db.query<DeliveryPayload>(
        `select d.id,d.notification_id,d.user_id,u.email::text,n.title,n.body
         from notification_deliveries d
         join notifications n on n.id=d.notification_id
         join app_users u on u.id=d.user_id
         where d.id=$1 and d.claimed_by=$2 and d.status='sending'`,
        [job.id, this.workerId],
      );
      const payload = rows[0];
      if (!payload) return false;

      if (!payload.email) {
        await this.db.query(
          `update notification_deliveries
           set status='skipped',attempts=attempts+1,claimed_at=null,claimed_by=null,
               claim_expires_at=null,last_error_code='no_email',updated_at=now()
           where id=$1 and claimed_by=$2`,
          [job.id, this.workerId],
        );
        return false;
      }

      const result = await this.provider.send({
        notificationId: payload.notification_id,
        recipient: payload.email,
        subject: payload.title,
        body: payload.body,
        idempotencyKey: `notification:${payload.notification_id}:email`,
      });
      await this.db.query(
        `update notification_deliveries
         set status='sent',provider=$3,provider_message_id=$4,sent_at=now(),attempts=attempts+1,
             claimed_at=null,claimed_by=null,claim_expires_at=null,last_error_code=null,updated_at=now()
         where id=$1 and claimed_by=$2`,
        [job.id, this.workerId, this.provider.name, result.providerMessageId],
      );
      return true;
    } catch {
      await this.releaseFailed(job.id);
      this.logger.error(`Notification delivery failed for job ${job.id}`);
      return false;
    }
  }

  private async releaseFailed(jobId: string): Promise<void> {
    try {
      await this.db.query(
        `update notification_deliveries
         set status='failed',attempts=attempts+1,claimed_at=null,claimed_by=null,
             claim_expires_at=null,last_error_code='provider_error',updated_at=now()
         where id=$1 and claimed_by=$2`,
        [jobId, this.workerId],
      );
    } catch {
      this.logger.error(`Failed to release notification delivery job ${jobId}`);
    }
  }
}
