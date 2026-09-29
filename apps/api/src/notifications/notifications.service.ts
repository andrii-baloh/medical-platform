import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type { Principal } from "../auth/principal";

/** Row shape returned by the notifications table. */
type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  appointment_id: string | null;
  read_at: Date | null;
  created_at: Date;
};

export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string;
  appointmentId: string | null;
  readAt: string | null;
  createdAt: string;
};

function mapNotification(r: NotificationRow): NotificationDto {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    appointmentId: r.appointment_id ?? null,
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
  ) {}

  async list(principal: Principal): Promise<NotificationDto[]> {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<NotificationRow>(
      `select id,type,title,body,appointment_id,read_at,created_at
       from notifications where user_id=$1 order by created_at desc limit 100`,
      [user.id],
    );
    return rows.map(mapNotification);
  }

  async unreadCount(principal: Principal): Promise<{ count: number }> {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<{ count: number }>(
      `select count(*)::int count from notifications where user_id=$1 and read_at is null`,
      [user.id],
    );
    return { count: rows[0]?.count ?? 0 };
  }

  /** A user can only read their own notifications; anything else is 404. */
  async markRead(principal: Principal, notificationId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<{ id: string; read_at: Date }>(
      `update notifications set read_at=coalesce(read_at, now())
       where id=$1 and user_id=$2 returning id,read_at`,
      [notificationId, user.id],
    );
    if (!rows[0]) throw new NotFoundException("Notification not found");
    return { id: rows[0].id, readAt: new Date(rows[0].read_at).toISOString() };
  }

  async markAllRead(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const result = await this.db.query(
      `update notifications set read_at=now() where user_id=$1 and read_at is null`,
      [user.id],
    );
    return { updated: result.rowCount ?? 0 };
  }
}
