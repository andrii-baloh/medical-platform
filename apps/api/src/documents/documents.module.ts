import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentScanWorker } from "./scanning/document-scan.worker";
import { DOCUMENT_SCANNER } from "./scanning/document-scanner.provider";
import { DevelopmentPassScannerProvider } from "./scanning/providers/development-pass-scanner.provider";

@Module({
  imports: [UsersModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentScanWorker,
    DevelopmentPassScannerProvider,
    {
      provide: DOCUMENT_SCANNER,
      inject: [DevelopmentPassScannerProvider],
      useFactory: (development: DevelopmentPassScannerProvider) => {
        const provider = process.env.DOCUMENT_SCAN_PROVIDER ?? "development-pass";
        if (provider !== "development-pass") throw new Error(`Unsupported DOCUMENT_SCAN_PROVIDER: ${provider}`);
        return development;
      },
    },
  ],
})
export class DocumentsModule {}
