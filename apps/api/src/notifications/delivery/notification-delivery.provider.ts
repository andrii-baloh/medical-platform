export type NotificationDeliveryMessage = {
  notificationId: string;
  recipient: string;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export type NotificationDeliveryResult = {
  providerMessageId: string | null;
};

export interface NotificationEmailProvider {
  readonly name: string;
  send(message: NotificationDeliveryMessage): Promise<NotificationDeliveryResult>;
}

export const NOTIFICATION_EMAIL_PROVIDER = Symbol("NOTIFICATION_EMAIL_PROVIDER");
