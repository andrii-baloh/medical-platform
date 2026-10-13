import { Module } from "@nestjs/common";
import { UsersModule } from "../../users/users.module";
import { EgiszIntegrationController } from "./egisz-integration.controller";
import { EgiszIntegrationService } from "./egisz-integration.service";

@Module({
  imports: [UsersModule],
  controllers: [EgiszIntegrationController],
  providers: [EgiszIntegrationService],
  exports: [EgiszIntegrationService],
})
export class EgiszIntegrationModule {}
