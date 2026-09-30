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
import { PatientResultsModule } from "./patient-results/patient-results.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OutboxModule } from "./outbox/outbox.module";
import { PaymentsModule } from "./payments/payments.module";
import { AdminModule } from "./admin/admin.module";
import { SupportModule } from "./support/support.module";
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
    PatientResultsModule,
    NotificationsModule,
    OutboxModule,
    PaymentsModule,
    AdminModule,
    SupportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
