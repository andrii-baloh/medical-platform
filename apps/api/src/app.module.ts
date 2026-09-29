import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DbModule } from "./db/db.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { DoctorsModule } from "./doctors/doctors.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { DocumentsModule } from "./documents/documents.module";
import { AuditModule } from "./audit/audit.module";
import { HealthController } from "./common/health.controller";
import { DoctorWorkspaceModule } from "./doctor-workspace/doctor-workspace.module";
import { VideoModule } from "./video/video.module";
import { validateEnv } from "./config/env";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    AuditModule,
    UsersModule,
    DoctorsModule,
    AppointmentsModule,
    DocumentsModule,
    DoctorWorkspaceModule,
    VideoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
