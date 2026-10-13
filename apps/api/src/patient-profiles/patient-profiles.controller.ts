import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { CreatePatientProfileDto, UpdatePatientProfileDto } from "./patient-profiles.dto";
import { PatientProfilesService } from "./patient-profiles.service";

@Controller("patient-profiles")
export class PatientProfilesController {
  constructor(private readonly profiles: PatientProfilesService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.profiles.list(principal);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreatePatientProfileDto) {
    return this.profiles.create(principal, body);
  }

  @Patch(":id")
  update(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: UpdatePatientProfileDto) {
    return this.profiles.update(principal, id, body);
  }

  @Post(":id/archive")
  archive(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.profiles.archive(principal, id);
  }
}
