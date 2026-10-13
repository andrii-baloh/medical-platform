import { Controller, Get } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { EsiaIdentityService } from "./esia-identity.service";
@Controller("identity/esia")
export class EsiaIdentityController {
  constructor(private readonly service: EsiaIdentityService) {}
  @Get("status") status(@CurrentPrincipal() principal: Principal){ return this.service.status(principal); }
  @Get("patient-matches") patientMatches(@CurrentPrincipal() principal: Principal){ return this.service.patientMatches(principal); }
  @Get("representative-status") representativeIdentity(@CurrentPrincipal() principal: Principal){ return this.service.representativeIdentity(principal); }
}
