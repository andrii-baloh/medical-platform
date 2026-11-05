import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { CreateIncidentDto, ListIncidentsDto, RecordNotificationDto, UpdateIncidentDto } from "./security-incidents.dto";
import { SecurityIncidentsService } from "./security-incidents.service";

@Controller("admin/security-incidents")
export class SecurityIncidentsController {
  constructor(private readonly incidents: SecurityIncidentsService) {}
  @Get() list(@CurrentPrincipal() principal:Principal,@Query() query:ListIncidentsDto) {
    return this.incidents.list(principal,query);
  }
  @Get(":id") get(@CurrentPrincipal() principal:Principal,@Param("id",ParseUUIDPipe) id:string) {
    return this.incidents.get(principal,id);
  }
  @Post() create(@CurrentPrincipal() principal:Principal,@Body() body:CreateIncidentDto) {
    return this.incidents.create(principal,body);
  }
  @Patch(":id") update(@CurrentPrincipal() principal:Principal,@Param("id",ParseUUIDPipe) id:string,@Body() body:UpdateIncidentDto) {
    return this.incidents.update(principal,id,body);
  }
  @Post(":id/notifications") notification(@CurrentPrincipal() principal:Principal,@Param("id",ParseUUIDPipe) id:string,@Body() body:RecordNotificationDto) {
    return this.incidents.recordNotification(principal,id,body);
  }
}
