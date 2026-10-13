import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { EsiaIdentityController } from "./esia-identity.controller";
import { EsiaIdentityService } from "./esia-identity.service";
@Module({imports:[UsersModule],controllers:[EsiaIdentityController],providers:[EsiaIdentityService],exports:[EsiaIdentityService]})
export class EsiaIdentityModule {}
