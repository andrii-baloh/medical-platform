import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { UpdateDoctorAdminDto } from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("dashboard")
  dashboard(@CurrentPrincipal() principal: Principal) {
    return this.admin.dashboard(principal);
  }

  @Get("doctors")
  listDoctors(@CurrentPrincipal() principal: Principal) {
    return this.admin.listDoctors(principal);
  }

  @Get("doctors/:id")
  getDoctor(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.admin.getDoctor(principal, id);
  }

  @Patch("doctors/:id")
  updateDoctor(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: UpdateDoctorAdminDto,
  ) {
    return this.admin.updateDoctor(principal, id, body);
  }

  @Get("appointments")
  listAppointments(@CurrentPrincipal() principal: Principal) {
    return this.admin.listAppointments(principal);
  }

  @Get("payments")
  listPayments(@CurrentPrincipal() principal: Principal) {
    return this.admin.listPayments(principal);
  }

  @Get("notification-deliveries")
  listNotificationDeliveries(@CurrentPrincipal() principal: Principal) {
    return this.admin.listNotificationDeliveries(principal);
  }

  @Get("audit")
  listAudit(@CurrentPrincipal() principal: Principal, @Query("q") query?: string) {
    return this.admin.listAudit(principal, query);
  }
}
