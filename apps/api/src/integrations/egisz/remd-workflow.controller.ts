import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../../auth/current-principal.decorator";
import type { Principal } from "../../auth/principal";
import {
  ListRemdCandidatesQueryDto,
  ListRemdRegistrationsQueryDto,
} from "./remd-workflow.dto";
import { RemdWorkflowService } from "./remd-workflow.service";

@Controller("integrations/egisz/remd")
export class RemdWorkflowController {
  constructor(private readonly remd: RemdWorkflowService) {}

  @Get("registrations")
  list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListRemdRegistrationsQueryDto,
  ) {
    return this.remd.list(principal, query);
  }

  @Get("candidates")
  candidates(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListRemdCandidatesQueryDto,
  ) {
    return this.remd.candidates(principal, query);
  }

  @Get("registrations/:versionId")
  get(
    @CurrentPrincipal() principal: Principal,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.remd.get(principal, versionId);
  }

  @Get("registrations/:versionId/readiness")
  readiness(
    @CurrentPrincipal() principal: Principal,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.remd.readiness(principal, versionId);
  }

  @Post("registrations/:versionId")
  request(
    @CurrentPrincipal() principal: Principal,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.remd.requestRegistration(principal, versionId);
  }

  @Post("registrations/:versionId/refresh")
  refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.remd.refreshRegistration(principal, versionId);
  }

  @Post("registrations/:versionId/retry")
  retry(
    @CurrentPrincipal() principal: Principal,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    return this.remd.retry(principal, versionId);
  }
}
