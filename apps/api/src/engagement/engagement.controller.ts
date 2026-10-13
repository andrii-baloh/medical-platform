import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { UpdateDoctorReviewDto } from "./engagement.dto";
import { EngagementService } from "./engagement.service";

@Controller("engagement")
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get("favorites")
  favorites(@CurrentPrincipal() principal: Principal) {
    return this.engagement.listFavorites(principal);
  }

  @Post("favorites/:doctorId")
  addFavorite(@CurrentPrincipal() principal: Principal, @Param("doctorId") doctorId: string) {
    return this.engagement.addFavorite(principal, doctorId);
  }

  @Delete("favorites/:doctorId")
  removeFavorite(@CurrentPrincipal() principal: Principal, @Param("doctorId") doctorId: string) {
    return this.engagement.removeFavorite(principal, doctorId);
  }

  @Get("appointments/:appointmentId/review")
  review(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.engagement.getReview(principal, appointmentId);
  }

  @Put("appointments/:appointmentId/review")
  updateReview(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId") appointmentId: string,
    @Body() body: UpdateDoctorReviewDto,
  ) {
    return this.engagement.updateReview(principal, appointmentId, body.rating);
  }
}
