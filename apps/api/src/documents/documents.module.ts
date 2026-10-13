import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentScanWorker } from "./scanning/document-scan.worker";
import { DOCUMENT_SCANNER } from "./scanning/document-scanner.provider";
import { DevelopmentPassScannerProvider } from "./scanning/providers/development-pass-scanner.provider";
import { ClamAvScannerProvider } from "./scanning/providers/clamav-scanner.provider";

@Module({
  imports: [UsersModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentScanWorker,
    DevelopmentPassScannerProvider,
    ClamAvScannerProvider,
    {
      provide: DOCUMENT_SCANNER,
      inject: [DevelopmentPassScannerProvider, ClamAvScannerProvider],
      useFactory: (development: DevelopmentPassScannerProvider, clamav: ClamAvScannerProvider) => {
        const provider = process.env.DOCUMENT_SCAN_PROVIDER ?? "development-pass";
        if (provider === "development-pass") return development;
        if (provider === "clamav") return clamav;
        throw new Error(`Unsupported DOCUMENT_SCAN_PROVIDER: ${provider}`);
      },
    },
  ],
})
export class DocumentsModule {}
