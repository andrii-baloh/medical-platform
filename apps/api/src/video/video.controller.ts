import { Body, Controller, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { VideoJoinEventDto } from "./video.dto";
import { VideoService } from "./video.service";

/**
 * Video join endpoints.
 *
 * Patient and doctor have distinct routes, but both go through the same
 * backend authorization: role, appointment relationship, join window and
 * appointment status are all re-checked server-side.
 */
@Controller("video")
export class VideoController {
  constructor(private readonly video: VideoService) {}

  @Post("appointments/:id/join")
  joinAsPatient(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.video.join(principal, id);
  }

  @Post("doctor/appointments/:id/join")
  joinAsDoctor(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.video.join(principal, id);
  }

  @Post("appointments/:id/events")
  recordEvent(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: VideoJoinEventDto) {
    return this.video.recordEvent(principal, id, body.eventType);
  }

  @Post("doctor/appointments/:id/close")
  close(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.video.closeRoom(principal, id);
  }
}
