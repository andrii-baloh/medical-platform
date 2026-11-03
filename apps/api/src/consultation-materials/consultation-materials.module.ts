import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { ConsultationMaterialsController } from "./consultation-materials.controller";
import { ConsultationMaterialsService } from "./consultation-materials.service";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [ConsultationMaterialsController],
  providers: [ConsultationMaterialsService],
  exports: [ConsultationMaterialsService],
})
export class ConsultationMaterialsModule {}
