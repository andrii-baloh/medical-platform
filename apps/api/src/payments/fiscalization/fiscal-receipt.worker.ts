import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "../../db/db.service";
import { FISCAL_RECEIPT_PROVIDER, type FiscalReceiptKind, type FiscalReceiptProvider } from "./fiscal-receipt.provider";

type ClaimedReceipt = {
  id: string;
  previous_status: string;
  attempts: number;
};

type ReceiptContext = {
  id: string;
  payment_id: string;
  appointment_id: string;
  provider: string;
  receipt_type: FiscalReceiptKind;
  external_receipt_id: string | number;
  origin_external_reference: string | number | null;
  amount_minor: number;
  currency: string;
  client_email: string | null;
  client_phone: string | null;
  service_title: string | null;
};

const POLL_MS = Number(process.env.FISCAL_RECEIPT_POLL_INTERVAL_MS ?? 15000);
const BATCH_SIZE = Number(process.env.FISCAL_RECEIPT_BATCH_SIZE ?? 5);
const MAX_ATTEMPTS = Number(process.env.FISCAL_RECEIPT_MAX_ATTEMPTS ?? 8);
const CLAIM_TTL_SECONDS = Number(process.env.FISCAL_RECEIPT_CLAIM_TTL_SECONDS ?? 120);

/**
 * Fiscal receipt worker (54-ФЗ / online KKT).
 *
 * Delivery model: at-least-once with a database lease, the same pattern the
 * document-scan worker already uses in this repository:
 *  - a short transaction leases a batch with `FOR UPDATE SKIP LOCKED`;
 *  - each receipt is then registered or polled in its own transaction;
 *  - a crashed worker loses the lease after `claim_expires_at` and the row is
 *    picked up again, so no receipt is silently dropped;
 *  - fiscal attributes are only persisted after the KKT operator confirms them.
 */
@Injectable()
export class FiscalReceiptWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalReceiptWorker.name);
  private readonly workerId = `fiscal-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DbService,
    @Inject(FISCAL_RECEIPT_PROVIDER) private readonly provider: FiscalReceiptProvider,
  ) {}

  onModuleInit() {
    if ((process.env.FISCAL_RECEIPT_WORKER_ENABLED ?? "true") !== "true") {
      this.logger.log("Fiscal receipt worker disabled by configuration");
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.logger.log(`Fiscal receipt worker started (interval ${POLL_MS}ms, provider ${this.provider.name})`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const batch = await this.claimBatch();
      let completed = 0;
      for (const receipt of batch) {
        if (await this.processReceipt(receipt)) completed += 1;
      }
      return completed;
    } catch {
      this.logger.error("Fiscal receipt polling cycle failed");
      return 0;
    } finally {
      this.running = false;
    }
  }

  private claimBatch(): Promise<ClaimedReceipt[]> {
    return this.db.tx(async (client) => {
      const { rows: candidates } = await client.query<{ id: string; status: string }>(
        `select id,status
         from payment_fiscal_receipts
         where attempts < $1
           and (
             (status in ('pending','failed') and (claim_expires_at is null or claim_expires_at < now()))
             or (status in ('submitted','processing') and claim_expires_at < now())
           )
         order by created_at
         limit $2
         for update skip locked`,
        [MAX_ATTEMPTS, BATCH_SIZE],
      );
      if (!candidates.length) return [];

      const { rows: claimed } = await client.query<{ id: string; attempts: number }>(
        `update payment_fiscal_receipts
         set status='processing',claimed_at=now(),claimed_by=$2,
             claim_expires_at=now()+($3::int * interval '1 second'),updated_at=now()
         where id = any($1::uuid[])
         returning id,attempts`,
        [candidates.map((candidate) => candidate.id), this.workerId, CLAIM_TTL_SECONDS],
      );

      const attempts = new Map(claimed.map((row) => [row.id, row.attempts]));
      return candidates.map((candidate) => ({
        id: candidate.id,
        previous_status: candidate.status,
        attempts: attempts.get(candidate.id) ?? 0,
      }));
    });
  }

  private async loadContext(receiptId: string): Promise<ReceiptContext | null> {
    const { rows } = await this.db.query<ReceiptContext>(
      `select r.id,r.payment_id,r.appointment_id,r.provider,r.receipt_type,
              r.external_receipt_id,r.origin_external_reference,r.amount_minor,r.currency,
              r.client_email,r.client_phone,so.title service_title
       from payment_fiscal_receipts r
       join appointments a on a.id=r.appointment_id
       left join service_offers so on so.id=a.service_offer_id
       where r.id=$1`,
      [receiptId],
    );
    return rows[0] ?? null;
  }

  private async processReceipt(claim: ClaimedReceipt): Promise<boolean> {
    const stopHeartbeat = this.startLeaseHeartbeat(claim.id);
    try {
      const context = await this.loadContext(claim.id);
      if (!context) {
        await this.release(claim.id, { status: "not_provided", errorCode: "receipt_context_missing" });
        return true;
      }
      if (!context.origin_external_reference) {
        await this.release(claim.id, { status: "not_provided", errorCode: "origin_reference_missing" });
        return true;
      }

      const externalReceiptId = Number(context.external_receipt_id);
      const originExternalReference = Number(context.origin_external_reference);
      if (!Number.isSafeInteger(externalReceiptId) || !Number.isSafeInteger(originExternalReference)) {
        await this.release(claim.id, { status: "not_provided", errorCode: "receipt_reference_invalid" });
        return true;
      }

      if (claim.previous_status === "pending" || claim.previous_status === "failed") {
        const result = await this.provider.register({
          receiptType: context.receipt_type,
          externalReceiptId,
          originExternalReference,
          amountMinor: context.amount_minor,
          currency: context.currency,
          description: context.service_title ?? "Медицинская онлайн-консультация",
          clientEmail: context.client_email,
          clientPhone: context.client_phone,
        });

        if (result.outcome === "submitted") {
          await this.release(claim.id, {
            status: "submitted",
            errorCode: null,
            submittedAt: true,
            providerResponse: result.response,
          });
          return true;
        }
        if (result.outcome === "not_provided") {
          await this.release(claim.id, {
            status: "not_provided",
            errorCode: result.errorCode ?? "receipt_not_provided",
            providerResponse: result.response,
          });
          return true;
        }
        await this.release(claim.id, {
          status: "failed",
          errorCode: result.errorCode ?? "receipt_registration_rejected",
          providerResponse: result.response,
        });
        return false;
      }

      const state = await this.provider.getState({ externalReceiptId, originExternalReference });
      if (state.state === "confirmed") {
        await this.release(claim.id, {
          status: "confirmed",
          fiscal: state,
          confirmedAt: true,
        });
        return true;
      }
      if (state.state === "failed" || state.state === "not_provided") {
        // The KKT operator made a final decision: retrying the same fiscal
        // operation would not help, so the row stops consuming attempts.
        await this.release(claim.id, {
          status: state.state,
          errorCode: state.state === "failed" ? "fiscal_registration_failed" : "receipt_not_provided",
          fiscal: state,
          exhaustRetries: true,
        });
        return false;
      }
      await this.release(claim.id, { status: "submitted", fiscal: state });
      return false;
    } catch {
      this.logger.error(`Fiscal receipt ${claim.id} processing failed`);
      await this.failAttempt(claim);
      return false;
    } finally {
      stopHeartbeat();
    }
  }

  private async release(
    receiptId: string,
    update: {
      status: string;
      errorCode?: string | null;
      fiscal?: { fnNumber: string | null; documentNumber: string | null; documentAttribute: string | null; registeredAt: string | null };
      providerResponse?: unknown;
      submittedAt?: boolean;
      confirmedAt?: boolean;
      exhaustRetries?: boolean;
    },
  ) {
    await this.db.query(
      `update payment_fiscal_receipts
       set status=$2,
           attempts=case when $8 then $9 else attempts+1 end,
           last_error_code=$3,
           fiscal_fn_number=coalesce($4,fiscal_fn_number),
           fiscal_document_number=coalesce($5,fiscal_document_number),
           fiscal_document_attribute=coalesce($6,fiscal_document_attribute),
           fiscal_registered_at=coalesce($7::timestamptz,fiscal_registered_at),
           provider_response=coalesce($10::jsonb,provider_response),
           submitted_at=case when $11 then coalesce(submitted_at,now()) else submitted_at end,
           confirmed_at=case when $12 then coalesce(confirmed_at,now()) else confirmed_at end,
           claimed_at=null,claimed_by=null,claim_expires_at=null,updated_at=now()
       where id=$1 and claimed_by=$13 and status='processing'`,
      [
        receiptId,
        update.status,
        update.errorCode ?? null,
        update.fiscal?.fnNumber ?? null,
        update.fiscal?.documentNumber ?? null,
        update.fiscal?.documentAttribute ?? null,
        update.fiscal?.registeredAt ?? null,
        Boolean(update.exhaustRetries),
        MAX_ATTEMPTS,
        update.providerResponse === undefined ? null : JSON.stringify(update.providerResponse),
        Boolean(update.submittedAt),
        Boolean(update.confirmedAt),
        this.workerId,
      ],
    );
  }

  private async failAttempt(claim: ClaimedReceipt) {
    try {
      const retryableStatus = claim.previous_status === "pending" || claim.previous_status === "failed" ? "pending" : "submitted";
      await this.db.query(
        `update payment_fiscal_receipts
         set status=$2,attempts=attempts+1,last_error_code='fiscal_provider_unavailable',
             claimed_at=null,claimed_by=null,claim_expires_at=null,updated_at=now()
         where id=$1 and claimed_by=$3 and status='processing'`,
        [claim.id, retryableStatus, this.workerId],
      );
    } catch {
      this.logger.error(`Failed to record fiscal receipt failure for ${claim.id}`);
    }
  }

  private startLeaseHeartbeat(receiptId: string): () => void {
    const intervalMs = Math.max(10_000, Math.floor((CLAIM_TTL_SECONDS * 1000) / 3));
    const timer = setInterval(() => void this.renewLease(receiptId), intervalMs);
    return () => clearInterval(timer);
  }

  private async renewLease(receiptId: string): Promise<void> {
    try {
      await this.db.query(
        `update payment_fiscal_receipts
         set claim_expires_at=now()+($3::int * interval '1 second'),updated_at=now()
         where id=$1 and claimed_by=$2 and status='processing'`,
        [receiptId, this.workerId, CLAIM_TTL_SECONDS],
      );
    } catch {
      this.logger.error(`Failed to renew fiscal receipt lease for ${receiptId}`);
    }
  }
}
