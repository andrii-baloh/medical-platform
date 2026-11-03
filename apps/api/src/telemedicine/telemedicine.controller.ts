import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { TelemedicineEventDto } from "./telemedicine.dto";
import { TelemedicineService } from "./telemedicine.service";

/**
 * Telemedicine session endpoints.
 *
 * Both routes resolve the caller through the appointment relationship, so a
 * patient cannot read another patient's session and a doctor cannot report
 * events for an appointment that is not theirs.
 */
@Controller("telemedicine")
export class TelemedicineController {
  constructor(private readonly telemedicine: TelemedicineService) {}

  @Get("appointments/:id/session")
  getSession(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.telemedicine.getForAppointment(principal, id);
  }

  @Post("appointments/:id/connection-issues")
  reportConnectionIssue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: TelemedicineEventDto,
  ) {
    return this.telemedicine.reportConnectionIssue(principal, id, body.event);
  }
}
