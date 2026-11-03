import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersModule } from "../users/users.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({ imports: [UsersModule, AuditModule], controllers: [AppointmentsController], providers: [AppointmentsService] })
export class AppointmentsModule {}
