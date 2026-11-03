import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersModule } from "../users/users.module";
import { DevelopmentFiscalReceiptProvider } from "./fiscalization/development-fiscal-receipt.provider";
import { FiscalReceiptWorker } from "./fiscalization/fiscal-receipt.worker";
import { FISCAL_RECEIPT_PROVIDER } from "./fiscalization/fiscal-receipt.provider";
import { FiscalReceiptsService } from "./fiscalization/fiscal-receipts.service";
import { RobokassaFiscalReceiptProvider } from "./fiscalization/robokassa-fiscal-receipt.provider";
import { PaymentsController } from "./payments.controller";
import { DevelopmentPaymentProvider } from "./providers/development-payment.provider";
import { RobokassaPaymentProvider } from "./providers/robokassa-payment.provider";
import { PAYMENT_PROVIDER } from "./payment.provider";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    DevelopmentPaymentProvider,
    RobokassaPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [DevelopmentPaymentProvider, RobokassaPaymentProvider],
      useFactory: (development: DevelopmentPaymentProvider, robokassa: RobokassaPaymentProvider) => {
        const provider = process.env.PAYMENT_PROVIDER ?? "development";
        if (provider === "development") return development;
        if (provider === "robokassa") return robokassa;
        throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
      },
    },
    FiscalReceiptsService,
    DevelopmentFiscalReceiptProvider,
    RobokassaFiscalReceiptProvider,
    {
      provide: FISCAL_RECEIPT_PROVIDER,
      inject: [DevelopmentFiscalReceiptProvider, RobokassaFiscalReceiptProvider],
      useFactory: (development: DevelopmentFiscalReceiptProvider, robokassa: RobokassaFiscalReceiptProvider) => {
        // Fiscal registration must follow the same acquirer that took the money:
        // the KKT service belongs to that provider, not to a separate vendor.
        const provider = process.env.PAYMENT_PROVIDER ?? "development";
        if (provider === "development") return development;
        if (provider === "robokassa") return robokassa;
        throw new Error(`Unsupported PAYMENT_PROVIDER for fiscalization: ${provider}`);
      },
    },
    FiscalReceiptWorker,
  ],
  exports: [PaymentsService, FiscalReceiptsService],
})
export class PaymentsModule {}
