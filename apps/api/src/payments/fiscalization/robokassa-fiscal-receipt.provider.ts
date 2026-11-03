import { Injectable, Logger } from "@nestjs/common";
import { robokassaClient, robokassaLogin } from "../providers/robokassa-client";
import type {
  FiscalReceiptProvider,
  FiscalReceiptState,
  FiscalRegistrationInput,
  FiscalRegistrationResult,
  FiscalStateQuery,
} from "./fiscal-receipt.provider";

type SecondCheckResponse = {
  ResultCode?: string | number;
  ResultDescription?: string;
};

type CheckStatusEntry = {
  Id?: string;
  Code?: string;
  Description?: string;
  FnNumber?: string;
  FiscalDocumentNumber?: string;
  FiscalDocumentAttribute?: string;
  FiscalDate?: string;
};

type CheckStatusResponse = {
  Code?: string | number;
  Description?: string;
  Statuses?: CheckStatusEntry[] | null;
};

const RECEIPT_DESCRIPTION_LIMIT = 128;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** `21.11.2025 15:51:00` (Robokassa fiscal date) → ISO-8601. */
function parseFiscalDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}+03:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Robokassa KKT adapter built on the MIT-licensed `@robokassa/sdk`.
 *
 * It implements the documented "second receipt" flow: the first receipt is
 * issued by Robokassa together with the payment, and the final receipt is
 * registered here after the medical service is actually rendered. Fiscal
 * attributes come from the provider status endpoint, never from local guesses.
 */
@Injectable()
export class RobokassaFiscalReceiptProvider implements FiscalReceiptProvider {
  readonly name = "robokassa";
  private readonly logger = new Logger(RobokassaFiscalReceiptProvider.name);

  async register(input: FiscalRegistrationInput): Promise<FiscalRegistrationResult> {
    if (input.currency !== "RUB") {
      return { outcome: "not_provided", providerReceiptId: null, errorCode: "unsupported_currency", response: null };
    }
    if (!input.clientEmail && !input.clientPhone) {
      // 54-ФЗ requires the electronic receipt to reach the customer, so a
      // receipt without any contact is parked instead of being silently lost.
      return { outcome: "not_provided", providerReceiptId: null, errorCode: "client_contact_missing", response: null };
    }

    const total = input.amountMinor / 100;
    const tax = process.env.ROBOKASSA_TAX ?? "none";
    const body = {
      merchantId: robokassaLogin(),
      id: String(input.externalReceiptId),
      originId: String(input.originExternalReference),
      operation: "sell",
      sno: process.env.ROBOKASSA_SNO ?? "osn",
      url: process.env.PUBLIC_WEB_URL ?? (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",")[0]?.trim(),
      total,
      items: [
        {
          name: input.description.slice(0, RECEIPT_DESCRIPTION_LIMIT),
          quantity: 1,
          sum: total,
          tax,
          // The customer already prepaid this service, so the final receipt is
          // issued with the full-payment attribute and an advance offset.
          payment_method: input.receiptType === "full_payment" ? "full_payment" : "full_prepayment",
          payment_object: process.env.ROBOKASSA_PAYMENT_OBJECT ?? "service",
        },
      ],
      client: input.clientEmail ? { email: input.clientEmail } : { phone: input.clientPhone },
      payments: [{ type: input.receiptType === "full_payment" ? 2 : 1, sum: total }],
      vats: [{ type: tax, sum: 0 }],
    };

    const raw = await robokassaClient().receipt.sendSecondCheck(body);
    const parsed = parseJson(raw) as SecondCheckResponse | null;
    const code = String(parsed?.ResultCode ?? "");
    const response = parsed ?? { raw: raw.slice(0, 512) };

    if (code === "0" || code === "1" || code === "2") {
      return { outcome: "submitted", providerReceiptId: String(input.externalReceiptId), errorCode: null, response };
    }
    if (code === "3") {
      this.logger.warn(`Robokassa rejected fiscal receipt ${input.externalReceiptId}: ${parsed?.ResultDescription ?? "unknown"}`);
      return { outcome: "failed", providerReceiptId: null, errorCode: "receipt_registration_rejected", response };
    }
    // 1000 is an internal provider error: retry instead of dropping the receipt.
    throw new Error(`Robokassa fiscal registration failed: ${parsed?.ResultDescription ?? raw.slice(0, 200)}`);
  }

  async getState(query: FiscalStateQuery): Promise<FiscalReceiptState> {
    const raw = (await robokassaClient().receipt.getCheckStatus({
      MerchantID: robokassaLogin(),
      ID: String(query.externalReceiptId),
      OriginID: String(query.originExternalReference),
    })) as CheckStatusResponse;

    const statusCode = String(raw?.Code ?? "");
    if (statusCode === "1000" || statusCode === "1001") {
      throw new Error(`Robokassa fiscal status request rejected: ${raw?.Description ?? statusCode}`);
    }

    const entry = raw?.Statuses?.[0];
    const code = entry?.Code ?? "";
    const base = {
      fnNumber: entry?.FnNumber ?? null,
      documentNumber: entry?.FiscalDocumentNumber ?? null,
      documentAttribute: entry?.FiscalDocumentAttribute ?? null,
      registeredAt: parseFiscalDate(entry?.FiscalDate),
    };

    if (code === "Done" || code === "2") return { state: "confirmed", ...base };
    if (code === "Fail" || code === "3") return { state: "failed", ...base };
    if (code === "NotProvided" || code === "4") return { state: "not_provided", ...base };
    // None / Wait / unknown: still being fiscalized.
    return { state: "pending", ...base };
  }
}
