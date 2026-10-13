import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { MedicalRecordsController } from "./medical-records.controller";
import { MedicalRecordsService } from "./medical-records.service";

@Module({
  imports: [UsersModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
