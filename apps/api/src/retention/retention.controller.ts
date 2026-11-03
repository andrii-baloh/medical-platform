import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { UpsertRetentionPolicyDto } from "./retention.dto";
import { RetentionService } from "./retention.service";

/**
 * Retention administration.
 *
 * Only administrators can configure a policy, and nothing is deleted until a
 * policy carries a period, a legal basis and `active=true`.
 */
@Controller("admin/retention")
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get("policies")
  listPolicies(@CurrentPrincipal() principal: Principal) {
    return this.retention.listPolicies(principal);
  }

  @Put("policies/:dataClass")
  upsertPolicy(
    @CurrentPrincipal() principal: Principal,
    @Param("dataClass") dataClass: string,
    @Body() body: UpsertRetentionPolicyDto,
  ) {
    return this.retention.upsertPolicy(principal, dataClass, body);
  }

  @Post("policies/:dataClass/preview")
  preview(@CurrentPrincipal() principal: Principal, @Param("dataClass") dataClass: string) {
    return this.retention.preview(principal, dataClass);
  }

  @Post("policies/:dataClass/run")
  run(@CurrentPrincipal() principal: Principal, @Param("dataClass") dataClass: string) {
    return this.retention.execute(principal, dataClass);
  }

  @Get("runs")
  listRuns(@CurrentPrincipal() principal: Principal) {
    return this.retention.listRuns(principal);
  }
}
