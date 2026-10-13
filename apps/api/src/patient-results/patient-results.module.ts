import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { PatientResultsController } from "./patient-results.controller";
import { PatientResultsService } from "./patient-results.service";

@Module({
  imports: [UsersModule],
  controllers: [PatientResultsController],
  providers: [PatientResultsService],
})
export class PatientResultsModule {}
