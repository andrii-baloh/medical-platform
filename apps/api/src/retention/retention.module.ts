import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { RetentionController } from "./retention.controller";
import { RetentionService } from "./retention.service";
import { RetentionWorker } from "./retention.worker";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [RetentionController],
  providers: [RetentionService, RetentionWorker],
  exports: [RetentionService],
})
export class RetentionModule {}
