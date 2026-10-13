import { Controller, Get, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { UsersService } from "./users.service";

@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentPrincipal() principal: Principal) {
    return this.users.getMe(principal);
  }

  @Post("initialize")
  initialize(@CurrentPrincipal() principal: Principal) {
    return this.users.getMe(principal);
  }
}
