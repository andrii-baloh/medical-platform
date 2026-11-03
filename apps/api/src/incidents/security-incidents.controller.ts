import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import {
  CreateIncidentDto,
  IncidentNoteDto,
  IncidentStatusDto,
  UpdateIncidentDto,
} from "./security-incidents.dto";
import { SecurityIncidentsService } from "./security-incidents.service";

/**
 * Security incident workflow (admin-only).
 *
 * The incident record collects the facts required for mandatory notifications:
 * affected systems, data classes, user count, containment and regulator
 * contact. It never copies clinical content.
 */
@Controller("admin/security-incidents")
export class SecurityIncidentsController {
  constructor(private readonly incidents: SecurityIncidentsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query("status") status?: string) {
    return this.incidents.list(principal, status);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreateIncidentDto) {
    return this.incidents.create(principal, body);
  }

  @Get(":id")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.incidents.get(principal, id);
  }

  @Patch(":id")
  update(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: UpdateIncidentDto) {
    return this.incidents.update(principal, id, body);
  }

  @Post(":id/status")
  updateStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: IncidentStatusDto,
  ) {
    return this.incidents.updateStatus(principal, id, body);
  }

  @Post(":id/notes")
  addNote(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: IncidentNoteDto) {
    return this.incidents.addNote(principal, id, body);
  }
}
