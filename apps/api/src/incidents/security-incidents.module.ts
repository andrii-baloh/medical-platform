import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { SecurityIncidentsController } from "./security-incidents.controller";
import { SecurityIncidentsService } from "./security-incidents.service";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [SecurityIncidentsController],
  providers: [SecurityIncidentsService],
  exports: [SecurityIncidentsService],
})
export class SecurityIncidentsModule {}
