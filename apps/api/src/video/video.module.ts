import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { UsersModule } from "../users/users.module";
import { AuditModule } from "../audit/audit.module";
import { VideoController } from "./video.controller";
import { VideoService } from "./video.service";
import { VIDEO_PROVIDER } from "./video.provider";
import { LiveKitVideoProvider } from "./providers/livekit-video.provider";

@Module({
  imports: [DbModule, UsersModule, AuditModule],
  controllers: [VideoController],
  providers: [VideoService, { provide: VIDEO_PROVIDER, useClass: LiveKitVideoProvider }],
  exports: [VideoService],
})
export class VideoModule {}
