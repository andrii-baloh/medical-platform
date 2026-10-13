import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import {
  CreateStandaloneEncounterDto,
  TransitionMedicalEncounterDto,
  UpdateMedicalEncounterDto,
} from "./medical-encounter.dto";
import { MedicalEncountersService } from "./medical-encounters.service";

@Controller("medical-encounters")
export class MedicalEncountersController {
  constructor(private readonly encounters: MedicalEncountersService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query("patientId") patientId?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
  ) {
    return this.encounters.list(principal, { patientId, status, type });
  }

  @Post()
  createStandalone(@CurrentPrincipal() principal: Principal, @Body() body: CreateStandaloneEncounterDto) {
    return this.encounters.createStandalone(principal, body);
  }

  @Get("appointment/:appointmentId")
  byAppointment(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.encounters.byAppointment(principal, appointmentId);
  }

  @Patch("appointment/:appointmentId")
  updateByAppointment(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId") appointmentId: string,
    @Body() body: UpdateMedicalEncounterDto,
  ) {
    return this.encounters.updateByAppointment(principal, appointmentId, body);
  }

  @Get(":id")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.encounters.get(principal, id);
  }

  @Patch(":id")
  update(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: UpdateMedicalEncounterDto) {
    return this.encounters.updateStandalone(principal, id, body);
  }

  @Post(":id/status")
  transition(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: TransitionMedicalEncounterDto,
  ) {
    return this.encounters.transition(principal, id, body.status, body.reason);
  }
}
