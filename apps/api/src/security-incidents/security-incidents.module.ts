import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { SecurityIncidentsController } from "./security-incidents.controller";
import { SecurityIncidentsService } from "./security-incidents.service";

@Module({
  imports:[UsersModule],
  controllers:[SecurityIncidentsController],
  providers:[SecurityIncidentsService],
})
export class SecurityIncidentsModule {}
