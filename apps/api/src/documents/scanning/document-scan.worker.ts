import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "../../db/db.service";
import { DOCUMENT_SCANNER, type DocumentScannerProvider } from "./document-scanner.provider";

type ScanJob = {
  id: string;
  document_id: string;
  attempts: number;
};

type ScanDocument = {
  id: string;
  storage_key: string;
  mime_type: string;
  detected_mime_type: string | null;
  sha256_hex: string | null;
  size_bytes: string | number;
  status: string;
  scan_status: string;
};

const POLL_MS = Number(process.env.DOCUMENT_SCAN_POLL_INTERVAL_MS ?? 5000);
const BATCH_SIZE = Number(process.env.DOCUMENT_SCAN_BATCH_SIZE ?? 10);
const MAX_ATTEMPTS = Number(process.env.DOCUMENT_SCAN_MAX_ATTEMPTS ?? 5);
const CLAIM_TTL_SECONDS = Number(process.env.DOCUMENT_SCAN_CLAIM_TTL_SECONDS ?? 120);

@Injectable()
export class DocumentScanWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentScanWorker.name);
  private readonly workerId = `scan-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DbService,
    @Inject(DOCUMENT_SCANNER) private readonly scanner: DocumentScannerProvider,
  ) {}

  onModuleInit() {
    if ((process.env.DOCUMENT_SCAN_WORKER_ENABLED ?? "true") !== "true") return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const jobs = await this.claimBatch();
      let completed = 0;
      for (const job of jobs) {
        if (await this.processJob(job)) completed += 1;
      }
      return completed;
    } catch {
      this.logger.error("Document scan polling cycle failed");
      return 0;
    } finally {
      this.running = false;
    }
  }

  private claimBatch(): Promise<ScanJob[]> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<ScanJob>(
        `with candidates as (
           select id
           from document_scan_jobs
           where attempts < $1
             and (
               (status in ('pending','failed') and (claim_expires_at is null or claim_expires_at < now()))
               or (status='processing' and claim_expires_at < now())
             )
           order by created_at
           limit $2
           for update skip locked
         )
         update document_scan_jobs j
         set status='processing', claimed_at=now(), claimed_by=$3,
             claim_expires_at=now()+($4::int * interval '1 second'), updated_at=now()
         from candidates c
         where j.id=c.id
         returning j.id,j.document_id,j.attempts`,
        [MAX_ATTEMPTS, BATCH_SIZE, this.workerId, CLAIM_TTL_SECONDS],
      );
      return rows;
    });
  }

  private async processJob(job: ScanJob): Promise<boolean> {
    const stopLeaseHeartbeat = this.startLeaseHeartbeat(job.id);
    try {
      const { rows } = await this.db.query<ScanDocument>(
        `select id,storage_key,mime_type,detected_mime_type,sha256_hex,size_bytes,status,scan_status
         from medical_documents where id=$1`,
        [job.document_id],
      );
      const document = rows[0];
      if (!document || document.status === "deleted") {
        await this.finishJob(job.id, "completed", null);
        return true;
      }
      if (!document.detected_mime_type || !document.sha256_hex) {
        await this.failJob(job.id, document.id, "missing_integrity_metadata");
        return false;
      }

      const result = await this.scanner.scan({
        documentId: document.id,
        bucket: process.env.S3_BUCKET_MEDICAL ?? "",
        storageKey: document.storage_key,
        declaredMimeType: document.mime_type,
        detectedMimeType: document.detected_mime_type,
        sha256Hex: document.sha256_hex,
        sizeBytes: Number(document.size_bytes),
      });

      if (result.verdict === "clean") {
        return this.db.tx(async (client) => {
          const lease = await client.query(
            `select 1 from document_scan_jobs
             where id=$1 and claimed_by=$2 and status='processing'
             for update`,
            [job.id, this.workerId],
          );
          if (!lease.rowCount) return false;
          await client.query(
            `update medical_documents
             set status='active',scan_status='clean',scan_provider=$2,scan_completed_at=now(),scan_error_code=null
             where id=$1 and status='quarantined'`,
            [document.id, this.scanner.name],
          );
          await client.query(
            `update document_scan_jobs
             set status='completed',attempts=attempts+1,completed_at=now(),updated_at=now(),
                 claimed_at=null,claimed_by=null,claim_expires_at=null,last_error_code=null
             where id=$1 and claimed_by=$2`,
            [job.id, this.workerId],
          );
          return true;
        });
      }

      if (result.verdict === "infected") {
        return this.db.tx(async (client) => {
          const lease = await client.query(
            `select 1 from document_scan_jobs
             where id=$1 and claimed_by=$2 and status='processing'
             for update`,
            [job.id, this.workerId],
          );
          if (!lease.rowCount) return false;
          await client.query(
            `update medical_documents
             set status='quarantined',scan_status='infected',scan_provider=$2,scan_completed_at=now(),scan_error_code=null
             where id=$1`,
            [document.id, this.scanner.name],
          );
          await client.query(
            `update document_scan_jobs
             set status='completed',attempts=attempts+1,completed_at=now(),updated_at=now(),
                 claimed_at=null,claimed_by=null,claim_expires_at=null,last_error_code=null
             where id=$1 and claimed_by=$2`,
            [job.id, this.workerId],
          );
          return true;
        });
      }

      await this.failJob(job.id, document.id, result.errorCode ?? "scanner_error");
      return false;
    } catch {
      await this.failJob(job.id, job.document_id, "scanner_exception");
      return false;
    } finally {
      stopLeaseHeartbeat();
    }
  }

  private startLeaseHeartbeat(jobId: string): () => void {
    const intervalMs = Math.max(10_000, Math.floor((CLAIM_TTL_SECONDS * 1000) / 3));
    const timer = setInterval(() => void this.renewLease(jobId), intervalMs);
    return () => clearInterval(timer);
  }

  private async renewLease(jobId: string): Promise<void> {
    try {
      await this.db.query(
        `update document_scan_jobs
         set claim_expires_at=now()+($3::int * interval '1 second'),updated_at=now()
         where id=$1 and claimed_by=$2 and status='processing'`,
        [jobId, this.workerId, CLAIM_TTL_SECONDS],
      );
    } catch {
      this.logger.error(`Failed to renew document scan lease for job ${jobId}`);
    }
  }

  private async finishJob(jobId: string, status: "completed", errorCode: string | null) {
    await this.db.query(
      `update document_scan_jobs
       set status=$2,attempts=attempts+1,completed_at=now(),updated_at=now(),
           claimed_at=null,claimed_by=null,claim_expires_at=null,last_error_code=$3
       where id=$1 and claimed_by=$4`,
      [jobId, status, errorCode, this.workerId],
    );
  }

  private async failJob(jobId: string, documentId: string, errorCode: string) {
    try {
      await this.db.tx(async (client) => {
        const lease = await client.query(
          `select 1 from document_scan_jobs
           where id=$1 and claimed_by=$2 and status='processing'
           for update`,
          [jobId, this.workerId],
        );
        if (!lease.rowCount) return;
        await client.query(
          `update medical_documents
           set status='quarantined',scan_status='error',scan_provider=$2,scan_error_code=$3
           where id=$1 and status<>'deleted'`,
          [documentId, this.scanner.name, errorCode],
        );
        await client.query(
          `update document_scan_jobs
           set status='failed',attempts=attempts+1,updated_at=now(),last_error_code=$2,
               claimed_at=null,claimed_by=null,claim_expires_at=null
           where id=$1 and claimed_by=$3`,
          [jobId, errorCode, this.workerId],
        );
      });
    } catch {
      this.logger.error(`Failed to persist document scan failure for job ${jobId}`);
    }
  }
}
