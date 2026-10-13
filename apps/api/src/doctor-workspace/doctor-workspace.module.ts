import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { AuditModule } from "../audit/audit.module";
import { DoctorWorkspaceController } from "./doctor-workspace.controller";
import { DoctorWorkspaceService } from "./doctor-workspace.service";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [DoctorWorkspaceController],
  providers: [DoctorWorkspaceService],
})
export class DoctorWorkspaceModule {}
