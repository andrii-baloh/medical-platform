import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NotificationDeliveryMessage, NotificationDeliveryResult, NotificationEmailProvider } from "../notification-delivery.provider";

/**
 * Local-only provider. It never contacts an external mail service and never
 * logs the recipient or message body. Production must use a real provider.
 */
@Injectable()
export class DevelopmentEmailProvider implements NotificationEmailProvider {
  readonly name = "development";

  async send(_message: NotificationDeliveryMessage): Promise<NotificationDeliveryResult> {
    return { providerMessageId: `dev-${randomUUID()}` };
  }
}
