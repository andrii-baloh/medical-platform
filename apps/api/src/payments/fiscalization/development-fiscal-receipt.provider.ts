import { Injectable } from "@nestjs/common";
import type {
  FiscalReceiptProvider,
  FiscalReceiptState,
  FiscalRegistrationResult,
} from "./fiscal-receipt.provider";

/**
 * Development fiscalization adapter.
 *
 * It performs no fiscal registration and never pretends a receipt was issued:
 * rows are parked as `not_provided` so the absence of a real KKT contract is
 * visible instead of faked in local or demo environments.
 */
@Injectable()
export class DevelopmentFiscalReceiptProvider implements FiscalReceiptProvider {
  readonly name = "development";

  async register(): Promise<FiscalRegistrationResult> {
    return {
      outcome: "not_provided",
      providerReceiptId: null,
      errorCode: "fiscalization_not_configured",
      response: null,
    };
  }

  async getState(): Promise<FiscalReceiptState> {
    return {
      state: "not_provided",
      fnNumber: null,
      documentNumber: null,
      documentAttribute: null,
      registeredAt: null,
    };
  }
}
