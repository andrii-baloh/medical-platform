import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { TelemedicineController } from "./telemedicine.controller";
import { TelemedicineService } from "./telemedicine.service";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [TelemedicineController],
  providers: [TelemedicineService],
  exports: [TelemedicineService],
})
export class TelemedicineModule {}
