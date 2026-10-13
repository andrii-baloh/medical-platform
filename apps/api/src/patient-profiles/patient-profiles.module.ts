import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { PatientProfilesController } from "./patient-profiles.controller";
import { PatientProfilesService } from "./patient-profiles.service";

@Module({
  imports: [UsersModule],
  controllers: [PatientProfilesController],
  providers: [PatientProfilesService],
})
export class PatientProfilesModule {}
