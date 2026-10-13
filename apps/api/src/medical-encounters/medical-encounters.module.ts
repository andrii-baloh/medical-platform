import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { MedicalEncountersController } from "./medical-encounters.controller";
import { MedicalEncountersService } from "./medical-encounters.service";

@Module({
  imports: [UsersModule],
  controllers: [MedicalEncountersController],
  providers: [MedicalEncountersService],
  exports: [MedicalEncountersService],
})
export class MedicalEncountersModule {}
