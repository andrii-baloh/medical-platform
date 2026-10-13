import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersModule } from "../users/users.module";
import { CommercialServicesController } from "./commercial-services.controller";
import { CommercialServicesService } from "./commercial-services.service";

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [CommercialServicesController],
  providers: [CommercialServicesService],
  exports: [CommercialServicesService],
})
export class CommercialServicesModule {}
