import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersModule } from "../users/users.module";
import { EngagementController } from "./engagement.controller";
import { EngagementService } from "./engagement.service";

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
