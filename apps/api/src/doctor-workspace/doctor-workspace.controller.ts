import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { ConsultationDraftDto, CreateDoctorSlotsDto, DoctorCancelAppointmentDto, SetWorkingHoursDto } from "./doctor-workspace.dto";
import { DoctorWorkspaceService } from "./doctor-workspace.service";

@Controller("doctor")
export class DoctorWorkspaceController {
  constructor(private readonly workspace: DoctorWorkspaceService) {}

  @Get("me") me(@CurrentPrincipal() principal: Principal) { return this.workspace.me(principal); }
  @Get("dashboard") dashboard(@CurrentPrincipal() principal: Principal) { return this.workspace.dashboard(principal); }
  @Get("appointments") appointments(@CurrentPrincipal() principal: Principal, @Query("from") from?: string, @Query("to") to?: string) { return this.workspace.appointments(principal, from, to); }
  @Get("appointments/:id") appointment(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.appointment(principal, id); }
  @Post("appointments/:id/start") start(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.startAppointment(principal, id); }
  @Post("appointments/:id/complete") complete(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.completeAppointment(principal, id); }
  @Post("appointments/:id/cancel") cancel(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: DoctorCancelAppointmentDto) { return this.workspace.cancelAppointment(principal, id, body.reason); }

  @Get("patients") patients(@CurrentPrincipal() principal: Principal) { return this.workspace.patients(principal); }
  @Get("patients/:id") patient(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.patient(principal, id); }

  @Put("appointments/:id/consultation") updateDraft(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: ConsultationDraftDto) { return this.workspace.updateDraft(principal, id, body); }
  @Post("appointments/:id/consultation/sign") sign(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.sign(principal, id); }
  @Post("appointments/:id/consultation/amend") amend(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.startAmendment(principal, id); }
  @Get("appointments/:id/consultation/versions") versions(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.versions(principal, id); }

  @Get("working-hours") workingHours(@CurrentPrincipal() principal: Principal) { return this.workspace.workingHours(principal); }
  @Put("working-hours") setWorkingHours(@CurrentPrincipal() principal: Principal, @Body() body: SetWorkingHoursDto) { return this.workspace.setWorkingHours(principal, body); }
  @Get("slots") slots(@CurrentPrincipal() principal: Principal, @Query("from") from?: string, @Query("to") to?: string) { return this.workspace.slots(principal, from, to); }
  @Post("slots") createSlots(@CurrentPrincipal() principal: Principal, @Body() body: CreateDoctorSlotsDto) { return this.workspace.createSlots(principal, body); }
  @Post("slots/:id/block") blockSlot(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.setSlotBlocked(principal, id, true); }
  @Post("slots/:id/unblock") unblockSlot(@CurrentPrincipal() principal: Principal, @Param("id") id: string) { return this.workspace.setSlotBlocked(principal, id, false); }
}
