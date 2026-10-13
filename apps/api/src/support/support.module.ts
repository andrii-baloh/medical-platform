import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AdminSupportController, SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [UsersModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
