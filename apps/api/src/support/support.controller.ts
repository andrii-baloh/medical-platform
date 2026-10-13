import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { AddSupportMessageDto, CreateSupportTicketDto, UpdateSupportTicketDto } from "./support.dto";
import { SupportService } from "./support.service";

@Controller("support")
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.support.listMine(principal);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreateSupportTicketDto) {
    return this.support.create(principal, body);
  }

  @Get(":id")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.support.getMine(principal, id);
  }

  @Post(":id/messages")
  addMessage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: AddSupportMessageDto,
  ) {
    return this.support.addMineMessage(principal, id, body);
  }
}

@Controller("admin/support")
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.support.listAdmin(principal);
  }

  @Get(":id")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.support.getAdmin(principal, id);
  }

  @Post(":id/messages")
  addMessage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: AddSupportMessageDto,
  ) {
    return this.support.addAdminMessage(principal, id, body);
  }

  @Patch(":id")
  update(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: UpdateSupportTicketDto,
  ) {
    return this.support.updateAdmin(principal, id, body);
  }
}
