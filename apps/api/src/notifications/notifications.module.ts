import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationDeliveryWorker } from "./delivery/notification-delivery.worker";
import { NOTIFICATION_EMAIL_PROVIDER } from "./delivery/notification-delivery.provider";
import { DevelopmentEmailProvider } from "./delivery/providers/development-email.provider";

@Module({
  imports: [UsersModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DevelopmentEmailProvider,
    { provide: NOTIFICATION_EMAIL_PROVIDER, useExisting: DevelopmentEmailProvider },
    NotificationDeliveryWorker,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
