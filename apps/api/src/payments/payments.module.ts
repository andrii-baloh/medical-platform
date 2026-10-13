import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersModule } from "../users/users.module";
import { PaymentsController } from "./payments.controller";
import { DevelopmentPaymentProvider } from "./providers/development-payment.provider";
import { PAYMENT_PROVIDER } from "./payment.provider";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    DevelopmentPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [DevelopmentPaymentProvider],
      useFactory: (development: DevelopmentPaymentProvider) => {
        const provider = process.env.PAYMENT_PROVIDER ?? "development";
        if (provider !== "development") throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
        return development;
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
