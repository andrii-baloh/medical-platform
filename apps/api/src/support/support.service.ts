import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type { AddSupportMessageDto, CreateSupportTicketDto, UpdateSupportTicketDto } from "./support.dto";

type TicketRow = {
  id: string;
  created_by_user_id: string;
  appointment_id: string | null;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
  owner_email?: string | null;
};

type MessageRow = {
  id: string;
  sender_user_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: Date;
  sender_email?: string | null;
};

@Injectable()
export class SupportService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireAdmin(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    if (!principal.roles.includes("admin")) throw new ForbiddenException("Admin role required");
    const { rows } = await this.db.query<{ ok: number }>(
      `select 1 ok from user_roles where user_id=$1 and role='admin'`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Admin role required");
    return user;
  }

  private mapTicket(row: TicketRow) {
    return {
      id: row.id,
      appointmentId: row.appointment_id,
      category: row.category,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      ...(row.owner_email !== undefined ? { ownerEmail: row.owner_email } : {}),
    };
  }

  private mapMessage(row: MessageRow) {
    return {
      id: row.id,
      senderRole: row.sender_role,
      body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
      ...(row.sender_email !== undefined ? { senderEmail: row.sender_email } : {}),
    };
  }

  async create(principal: Principal, input: CreateSupportTicketDto) {
    const user = await this.users.ensureAccount(principal);
    if (input.appointmentId) {
      const { rows } = await this.db.query<{ id: string }>(
        `select a.id from appointments a
         join patient_profiles p on p.id=a.patient_profile_id
         where a.id=$1 and p.owner_user_id=$2`,
        [input.appointmentId, user.id],
      );
      if (!rows[0]) throw new NotFoundException("Appointment not found");
    }

    const ticket = await this.db.tx(async (client) => {
      const { rows } = await client.query<TicketRow>(
        `insert into support_tickets(created_by_user_id,appointment_id,category,subject,status)
         values ($1,$2,$3,$4,'open') returning *`,
        [user.id, input.appointmentId ?? null, input.category, input.subject.trim()],
      );
      const created = rows[0];
      await client.query(
        `insert into support_messages(ticket_id,sender_user_id,sender_role,body)
         values ($1,$2,'user',$3)`,
        [created.id, user.id, input.message.trim()],
      );
      await client.query(
        `insert into notifications(user_id,type,title,body,payload,dedupe_key)
         select ur.user_id,'support.ticket.created','Новое обращение в поддержку',
                'В очереди поддержки появилось новое обращение.',$1::jsonb,$2
         from user_roles ur where ur.role='admin'
         on conflict do nothing`,
        [JSON.stringify({ ticketId: created.id }), `support-ticket-created:${created.id}`],
      );
      return created;
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "support.ticket.create",
      resourceType: "support_ticket",
      resourceId: ticket.id,
      metadata: { category: ticket.category, appointmentLinked: Boolean(ticket.appointment_id) },
    });
    return this.mapTicket(ticket);
  }

  async listMine(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<TicketRow>(
      `select * from support_tickets where created_by_user_id=$1 order by updated_at desc limit 100`,
      [user.id],
    );
    return rows.map((row) => this.mapTicket(row));
  }

  async getMine(principal: Principal, ticketId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<TicketRow>(
      `select * from support_tickets where id=$1 and created_by_user_id=$2`,
      [ticketId, user.id],
    );
    const ticket = rows[0];
    if (!ticket) throw new NotFoundException("Support ticket not found");
    const messages = await this.db.query<MessageRow>(
      `select id,sender_user_id,sender_role,body,created_at
       from support_messages where ticket_id=$1 order by created_at`,
      [ticketId],
    );
    return { ...this.mapTicket(ticket), messages: messages.rows.map((row) => this.mapMessage(row)) };
  }

  async addMineMessage(principal: Principal, ticketId: string, input: AddSupportMessageDto) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<TicketRow>(
      `select * from support_tickets where id=$1 and created_by_user_id=$2`,
      [ticketId, user.id],
    );
    const ticket = rows[0];
    if (!ticket) throw new NotFoundException("Support ticket not found");
    if (ticket.status === "closed") throw new ConflictException("Support ticket is closed");

    await this.db.tx(async (client) => {
      await client.query(
        `insert into support_messages(ticket_id,sender_user_id,sender_role,body)
         values ($1,$2,'user',$3)`,
        [ticketId, user.id, input.message.trim()],
      );
      await client.query(
        `update support_tickets
         set status='pending_support',resolved_at=null,updated_at=now()
         where id=$1`,
        [ticketId],
      );
      await client.query(
        `insert into notifications(user_id,type,title,body,payload,dedupe_key)
         select ur.user_id,'support.ticket.user_message','Новое сообщение в поддержку',
                'Пользователь добавил сообщение в обращение.',$1::jsonb,$2
         from user_roles ur where ur.role='admin'
         on conflict do nothing`,
        [JSON.stringify({ ticketId }), `support-user-message:${ticketId}:${Date.now()}`],
      );
    });
    return this.getMine(principal, ticketId);
  }

  async listAdmin(principal: Principal) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query<TicketRow>(
      `select t.*,u.email::text owner_email
       from support_tickets t join app_users u on u.id=t.created_by_user_id
       order by case t.status when 'open' then 0 when 'pending_support' then 1 else 2 end,
                case t.priority when 'high' then 0 else 1 end,
                t.updated_at desc
       limit 250`,
    );
    return rows.map((row) => this.mapTicket(row));
  }

  async getAdmin(principal: Principal, ticketId: string) {
    await this.requireAdmin(principal);
    const { rows } = await this.db.query<TicketRow>(
      `select t.*,u.email::text owner_email
       from support_tickets t join app_users u on u.id=t.created_by_user_id
       where t.id=$1`,
      [ticketId],
    );
    const ticket = rows[0];
    if (!ticket) throw new NotFoundException("Support ticket not found");
    const messages = await this.db.query<MessageRow>(
      `select m.id,m.sender_user_id,m.sender_role,m.body,m.created_at,u.email::text sender_email
       from support_messages m join app_users u on u.id=m.sender_user_id
       where m.ticket_id=$1 order by m.created_at`,
      [ticketId],
    );
    return { ...this.mapTicket(ticket), messages: messages.rows.map((row) => this.mapMessage(row)) };
  }

  async addAdminMessage(principal: Principal, ticketId: string, input: AddSupportMessageDto) {
    const admin = await this.requireAdmin(principal);
    const { rows } = await this.db.query<TicketRow>(`select * from support_tickets where id=$1`, [ticketId]);
    const ticket = rows[0];
    if (!ticket) throw new NotFoundException("Support ticket not found");
    if (ticket.status === "closed") throw new ConflictException("Support ticket is closed");

    await this.db.tx(async (client) => {
      await client.query(
        `insert into support_messages(ticket_id,sender_user_id,sender_role,body)
         values ($1,$2,'admin',$3)`,
        [ticketId, admin.id, input.message.trim()],
      );
      await client.query(
        `update support_tickets set status='pending_user',updated_at=now() where id=$1`,
        [ticketId],
      );
      await client.query(
        `insert into notifications(user_id,type,title,body,payload,dedupe_key)
         values ($1,'support.ticket.admin_message','Ответ службы поддержки',
                 'Служба поддержки ответила на ваше обращение.',$2::jsonb,$3)
         on conflict do nothing`,
        [ticket.created_by_user_id, JSON.stringify({ ticketId }), `support-admin-message:${ticketId}:${Date.now()}`],
      );
    });

    await this.audit.record({
      actorUserId: admin.id,
      actorSubject: principal.sub,
      action: "support.ticket.reply",
      resourceType: "support_ticket",
      resourceId: ticketId,
      metadata: {},
    });
    return this.getAdmin(principal, ticketId);
  }

  async updateAdmin(principal: Principal, ticketId: string, input: UpdateSupportTicketDto) {
    const admin = await this.requireAdmin(principal);
    const { rows } = await this.db.query<TicketRow>(
      `update support_tickets
       set status=coalesce($2,status),priority=coalesce($3,priority),
           resolved_at=case when $2='resolved' then now() when $2 is not null and $2<>'resolved' then null else resolved_at end,
           closed_at=case when $2='closed' then now() when $2 is not null and $2<>'closed' then null else closed_at end,
           updated_at=now()
       where id=$1 returning *`,
      [ticketId, input.status ?? null, input.priority ?? null],
    );
    const ticket = rows[0];
    if (!ticket) throw new NotFoundException("Support ticket not found");
    await this.audit.record({
      actorUserId: admin.id,
      actorSubject: principal.sub,
      action: "support.ticket.update",
      resourceType: "support_ticket",
      resourceId: ticketId,
      metadata: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
      },
    });
    return this.mapTicket(ticket);
  }
}
