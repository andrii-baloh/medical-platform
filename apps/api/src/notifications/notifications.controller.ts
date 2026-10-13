import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.notifications.list(principal);
  }

  @Get("unread-count")
  unreadCount(@CurrentPrincipal() principal: Principal) {
    return this.notifications.unreadCount(principal);
  }

  @Post(":id/read")
  markRead(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.notifications.markRead(principal, id);
  }

  @Post("read-all")
  markAllRead(@CurrentPrincipal() principal: Principal) {
    return this.notifications.markAllRead(principal);
  }
}
