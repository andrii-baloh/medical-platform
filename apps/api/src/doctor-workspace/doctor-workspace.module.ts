import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { AuditModule } from "../audit/audit.module";
import { PaymentsModule } from "../payments/payments.module";
import { TelemedicineModule } from "../telemedicine/telemedicine.module";
import { DoctorWorkspaceController } from "./doctor-workspace.controller";
import { DoctorWorkspaceService } from "./doctor-workspace.service";

@Module({
  imports: [DbModule, UsersModule, AuditModule, PaymentsModule, TelemedicineModule],
  controllers: [DoctorWorkspaceController],
  providers: [DoctorWorkspaceService],
})
export class DoctorWorkspaceModule {}
