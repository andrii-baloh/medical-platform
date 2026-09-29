import { Controller, Get, Param } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { PatientResultsService } from "./patient-results.service";

/**
 * Patient-facing read-only access to signed clinical conclusions.
 * A doctor's unsigned draft is never exposed here.
 */
@Controller("appointments")
export class PatientResultsController {
  constructor(private readonly results: PatientResultsService) {}

  @Get(":id/result")
  latest(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.results.getLatest(principal, id);
  }

  @Get(":id/result/versions")
  versions(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.results.listVersions(principal, id);
  }
}
