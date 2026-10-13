import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({ imports: [UsersModule], controllers: [AppointmentsController], providers: [AppointmentsService] })
export class AppointmentsModule {}
