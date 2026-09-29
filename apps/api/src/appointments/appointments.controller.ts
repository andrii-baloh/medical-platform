import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { BookAppointmentDto, CancelAppointmentDto } from "./appointment.dto";
import { AppointmentsService } from "./appointments.service";

@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) { return this.appointments.list(principal); }

  @Post()
  book(
    @CurrentPrincipal() principal: Principal,
    @Body() body: BookAppointmentDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.appointments.book(principal, body, idempotencyKey);
  }

  @Post(":id/cancel")
  cancel(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: CancelAppointmentDto) {
    return this.appointments.cancel(principal, id, body.reason);
  }
}
