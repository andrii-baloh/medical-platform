import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../../auth/current-principal.decorator";
import type { Principal } from "../../auth/principal";
import {
  CreateEgiszIntegrationJobDto,
  ListEgiszIntegrationJobsQueryDto,
} from "./egisz-integration.dto";
import { EgiszIntegrationService } from "./egisz-integration.service";

@Controller("integrations/egisz")
export class EgiszIntegrationController {
  constructor(private readonly egisz: EgiszIntegrationService) {}

  @Get("jobs")
  list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListEgiszIntegrationJobsQueryDto,
  ) {
    return this.egisz.list(principal, query);
  }

  @Get("jobs/:id")
  get(
    @CurrentPrincipal() principal: Principal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.egisz.get(principal, id);
  }

  @Post("jobs")
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateEgiszIntegrationJobDto,
  ) {
    return this.egisz.enqueue(principal, body);
  }

  @Post("jobs/:id/retry")
  retry(
    @CurrentPrincipal() principal: Principal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.egisz.retry(principal, id);
  }
}
