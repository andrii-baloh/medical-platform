"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { staffRequest as browserApi, StaffLoadState, useStaffResource } from "@/components/StaffRequest";

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
  const { data: ticketsData, loading, error, reload: loadTickets } = useStaffResource<Ticket[]>("/admin/support");
  const tickets = ticketsData ?? [];
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (selected) heading.current?.focus(); }, [selected?.id]);

  async function openTicket(id: string) {
    if (mutation.current) return;
    const current = ++request.current;
    setSelectedId(id);
    setSelected(null);
    setReply("");
    setMessage("");
    setThreadError("");
    setThreadLoading(true);
    try {
      const loaded = await browserApi<TicketDetail>(`/admin/support/${id}`);
      if (current === request.current) setSelected(loaded);
    } catch {
      if (current === request.current) setThreadError("Не удалось открыть обращение.");
    } finally {
      if (current === request.current) setThreadLoading(false);
    }
  }

  async function mutate(patch?: { status?: string; priority?: string }) {
    if (mutation.current || !selected || (!patch && !reply.trim())) return;
    mutation.current = true;
    const current = request.current;
    setBusy(true);
    setMessage("");
    try {
      if (patch) {
        await browserApi(`/admin/support/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        // Retain the selected entity and draft; the PATCH response contract is unchanged.
        if (current === request.current) setSelected({ ...selected, ...patch });
      } else {
        const updated = await browserApi<TicketDetail>(`/admin/support/${selected.id}/messages`, {
          method: "POST", body: JSON.stringify({ message: reply.trim() }),
        });
        if (current === request.current) { setSelected(updated); setReply(""); }
      }
      if (current === request.current) { setMessage("Изменения сохранены."); await loadTickets(); }
    } catch {
      if (current === request.current) setMessage("Не удалось сохранить изменения. Проверьте состояние обращения перед повтором.");
    } finally {
      mutation.current = false;
      if (current === request.current) setBusy(false);
    }
  }
  const sendReply = () => mutate();
  const updateTicket = (patch: { status?: string; priority?: string }) => mutate(patch);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((ticket) => `${ticket.subject} ${ticket.ownerEmail ?? ""} ${ticket.status} ${ticket.category}`.toLowerCase().includes(q));
  }, [tickets, query]);

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Поддержка</span><h1>Обращения пользователей</h1><p>Технические, платёжные и аккаунтные вопросы. Клинические записи пациента сюда не подгружаются автоматически.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input aria-label="Поиск по списку" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email, тема, статус или категория" /></label>
      <StaffLoadState loading={loading} error={error} retry={loadTickets} />
      {message && <div role="alert" className="notice error">{message}</div>}

      <div className="admin-support-layout">
        <section className="admin-support-list">
          {shown.map((ticket) => <button disabled={busy} aria-pressed={selectedId === ticket.id} key={ticket.id} className={`admin-support-ticket ${selected?.id === ticket.id ? "active" : ""}`} onClick={() => openTicket(ticket.id)}>
            <div><b>{ticket.subject}</b><small>{ticket.ownerEmail || "Без email"} · {ticket.category}</small></div>
            <span className={`payment-state payment-${ticket.status}`}>{statusLabels[ticket.status] || ticket.status}</span>
            {ticket.priority === "high" && <em>Высокий приоритет</em>}
          </button>)}
          {!loading && !error && !shown.length && <div className="card empty">Обращения не найдены.</div>}
        </section>

        <section className="admin-support-thread" aria-busy={threadLoading}>
          <StaffLoadState loading={threadLoading} error={threadError} retry={() => void openTicket(selectedId)} />
          {selected ? <div className="card admin-support-thread-card">
            <div className="admin-support-thread-head">
              <div><span className="eyebrow">{selected.ownerEmail || "Пользователь"}</span><h2 ref={heading} tabIndex={-1}>{selected.subject}</h2><p>{selected.category} · создано {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.createdAt))}</p></div>
              <div className="admin-support-controls">
                <select aria-label="Статус обращения" className="field" disabled={busy} value={selected.status} onChange={(event) => updateTicket({ status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select aria-label="Приоритет обращения" className="field" disabled={busy} value={selected.priority} onChange={(event) => updateTicket({ priority: event.target.value })}><option value="normal">Обычный приоритет</option><option value="high">Высокий приоритет</option></select>
              </div>
            </div>
            <div className="support-thread-messages admin-thread">{selected.messages.map((item) => <div className={`support-message ${item.senderRole}`} key={item.id}><b>{item.senderRole === "admin" ? "Поддержка" : item.senderEmail || "Пользователь"}</b><p>{item.body}</p><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>)}</div>
            {selected.status !== "closed" && <div className="support-reply-box"><textarea aria-label="Ответ пользователю" disabled={busy} className="field" rows={4} maxLength={5000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Ответ пользователю" /><button className="btn primary" disabled={busy || !reply.trim()} onClick={sendReply}>Отправить ответ</button></div>}
          </div> : !threadLoading && !threadError ? <div className="card empty">Выберите обращение.</div> : null}
        </section>
      </div>
    </main>
  );
}
