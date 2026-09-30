import { Injectable, Logger } from "@nestjs/common";
import type { DocumentScannerProvider, DocumentScanInput, DocumentScanResult } from "../document-scanner.provider";

/**
 * Local-development scanner only.
 * It deliberately does NOT provide malware detection and must never be used
 * as evidence that a file is safe in staging or production.
 */
@Injectable()
export class DevelopmentPassScannerProvider implements DocumentScannerProvider {
  readonly name = "development-pass";
  private readonly logger = new Logger(DevelopmentPassScannerProvider.name);
  private warned = false;

  async scan(_input: DocumentScanInput): Promise<DocumentScanResult> {
    if (!this.warned) {
      this.warned = true;
      this.logger.warn("DOCUMENT_SCAN_PROVIDER=development-pass: malware detection is NOT active");
    }
    return { verdict: "clean" };
  }
}
