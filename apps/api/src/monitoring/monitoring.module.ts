import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
