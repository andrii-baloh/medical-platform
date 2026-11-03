import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { RETENTION_DATA_CLASSES, type RetentionDataClass } from "./retention.dto";
import { RetentionService } from "./retention.service";

const POLL_INTERVAL_MS = Number(process.env.RETENTION_POLL_INTERVAL_MS ?? 21_600_000);

/**
 * Scheduled retention.
 *
 * Disabled by default: an organization must configure its policies first.
 * The worker only executes classes that already have an active policy with a
 * legal basis and only those with a real executor; everything else stays
 * untouched and visible on the admin screen.
 */
@Injectable()
export class RetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DbService,
    private readonly retention: RetentionService,
  ) {}

  onModuleInit() {
    if ((process.env.RETENTION_WORKER_ENABLED ?? "false") !== "true") {
      this.logger.log("Retention worker disabled by configuration");
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.logger.log(`Retention worker started (interval ${POLL_INTERVAL_MS}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { rows } = await this.db.query<{ data_class: RetentionDataClass }>(
        `select data_class from retention_policies where active=true and retention_days is not null and legal_basis is not null`,
      );
      for (const row of rows) {
        if (!(RETENTION_DATA_CLASSES as readonly string[]).includes(row.data_class)) continue;
        try {
          const result = await this.retention.executeScheduled(row.data_class);
          if (result.affected > 0) {
            this.logger.log(`Retention ${row.data_class}: affected ${result.affected} object(s)`);
          }
        } catch (error) {
          this.logger.error(`Retention ${row.data_class} failed: ${(error as Error).message}`);
        }
      }
    } catch {
      this.logger.error("Retention tick failed");
    } finally {
      this.running = false;
    }
  }
}
