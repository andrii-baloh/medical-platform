import { Body, Controller, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { VideoJoinEventDto } from "./video.dto";
import { VideoService } from "./video.service";

@Controller("video/appointments")
export class VideoController {
  constructor(private readonly video: VideoService) {}

  @Post(":id/token")
  issueToken(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.video.issueToken(principal, id);
  }

  @Post(":id/events")
  recordEvent(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: VideoJoinEventDto) {
    return this.video.recordEvent(principal, id, body.eventType);
  }

  @Post(":id/close")
  close(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.video.closeRoom(principal, id);
  }
}
