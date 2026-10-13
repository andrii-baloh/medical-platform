import { Module } from "@nestjs/common";
import { UsersModule } from "../../users/users.module";
import { EgiszIntegrationController } from "./egisz-integration.controller";
import { EgiszIntegrationService } from "./egisz-integration.service";
import { RemdWorkflowController } from "./remd-workflow.controller";
import { RemdWorkflowService } from "./remd-workflow.service";

@Module({
  imports: [UsersModule],
  controllers: [EgiszIntegrationController, RemdWorkflowController],
  providers: [EgiszIntegrationService, RemdWorkflowService],
  exports: [EgiszIntegrationService, RemdWorkflowService],
})
export class EgiszIntegrationModule {}
