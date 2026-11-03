import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PaymentsModule } from "../payments/payments.module";
import { UsersModule } from "../users/users.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [UsersModule, AuditModule, PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
