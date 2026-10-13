import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { MedicalConclusionsController } from "./medical-conclusions.controller";
import { MedicalConclusionsService } from "./medical-conclusions.service";

@Module({
  imports: [UsersModule],
  controllers: [MedicalConclusionsController],
  providers: [MedicalConclusionsService],
})
export class MedicalConclusionsModule {}
