"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Ticket = {
  id: string;
  appointmentId: string | null;
  category: string;
  subject: string;
  status: string;
  priority: string;
  ownerEmail?: string | null;
  createdAt: string;
  updatedAt: string;
};

type TicketDetail = Ticket & {
  messages: Array<{ id: string; senderRole: "user" | "admin"; senderEmail?: string | null; body: string; createdAt: string }>;
};

const statusLabels: Record<string, string> = {
  open: "Открыто",
  pending_user: "Ждём пользователя",
  pending_support: "Ждёт поддержки",
  resolved: "Решено",
  closed: "Закрыто",
};

export function AdminSupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadTickets() {
    try {
      const loaded = await browserApi<Ticket[]>("/admin/support");
      setTickets(loaded);
      if (!selected && loaded[0]) void openTicket(loaded[0].id);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      setMessage(status === 403 ? "Нет доступа администратора." : "Не удалось загрузить очередь поддержки.");
    }
  }

  useEffect(() => { void loadTickets(); }, []);

  async function openTicket(id: string) {
    setMessage("");
    try {
      setSelected(await browserApi<TicketDetail>(`/admin/support/${id}`));
    } catch {
      setMessage("Не удалось открыть обращение.");
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await browserApi<TicketDetail>(`/admin/support/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      });
      setSelected(updated);
      setReply("");
      await loadTickets();
    } catch {
      setMessage("Не удалось отправить ответ.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTicket(patch: { status?: string; priority?: string }) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await browserApi(`/admin/support/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await loadTickets();
      await openTicket(selected.id);
    } catch {
      setMessage("Не удалось обновить обращение.");
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((ticket) => `${ticket.subject} ${ticket.ownerEmail ?? ""} ${ticket.status} ${ticket.category}`.toLowerCase().includes(q));
  }, [tickets, query]);

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Поддержка</span><h1>Обращения пользователей</h1><p>Технические, платёжные и аккаунтные вопросы. Клинические записи пациента сюда не подгружаются автоматически.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email, тема, статус или категория" /></label>
      {message && <div className="notice error">{message}</div>}

      <div className="admin-support-layout">
        <section className="admin-support-list">
          {shown.map((ticket) => <button key={ticket.id} className={`admin-support-ticket ${selected?.id === ticket.id ? "active" : ""}`} onClick={() => openTicket(ticket.id)}>
            <div><b>{ticket.subject}</b><small>{ticket.ownerEmail || "Без email"} · {ticket.category}</small></div>
            <span className={`payment-state payment-${ticket.status}`}>{statusLabels[ticket.status] || ticket.status}</span>
            {ticket.priority === "high" && <em>Высокий приоритет</em>}
          </button>)}
          {!shown.length && <div className="card empty">Обращения не найдены.</div>}
        </section>

        <section className="admin-support-thread">
          {selected ? <div className="card admin-support-thread-card">
            <div className="admin-support-thread-head">
              <div><span className="eyebrow">{selected.ownerEmail || "Пользователь"}</span><h2>{selected.subject}</h2><p>{selected.category} · создано {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.createdAt))}</p></div>
              <div className="admin-support-controls">
                <select className="field" disabled={busy} value={selected.status} onChange={(event) => updateTicket({ status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select className="field" disabled={busy} value={selected.priority} onChange={(event) => updateTicket({ priority: event.target.value })}><option value="normal">Обычный приоритет</option><option value="high">Высокий приоритет</option></select>
              </div>
            </div>
            <div className="support-thread-messages admin-thread">{selected.messages.map((item) => <div className={`support-message ${item.senderRole}`} key={item.id}><b>{item.senderRole === "admin" ? "Поддержка" : item.senderEmail || "Пользователь"}</b><p>{item.body}</p><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>)}</div>
            {selected.status !== "closed" && <div className="support-reply-box"><textarea className="field" rows={4} maxLength={5000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Ответ пользователю" /><button className="btn primary" disabled={busy || !reply.trim()} onClick={sendReply}>Отправить ответ</button></div>}
          </div> : <div className="card empty">Выберите обращение.</div>}
        </section>
      </div>
    </main>
  );
}
