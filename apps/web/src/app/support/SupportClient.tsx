"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubbleLeftRightIcon, PlusIcon, ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { patientRequest as browserApi } from "@/components/patientRequest";

type Ticket = {
  id: string;
  appointmentId: string | null;
  category: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

type TicketDetail = Ticket & {
  messages: Array<{ id: string; senderRole: "user" | "admin"; body: string; createdAt: string }>;
};

type ApiError = Error & { status?: number };

const categoryLabels: Record<string, string> = {
  account: "Аккаунт",
  appointment: "Запись",
  payment: "Оплата",
  technical: "Технический вопрос",
  other: "Другое",
};

const statusLabels: Record<string, string> = {
  open: "Открыто",
  pending_user: "Ждём вашего ответа",
  pending_support: "На рассмотрении",
  resolved: "Решено",
  closed: "Закрыто",
};

export function SupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [category, setCategory] = useState("technical");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  const mutation = useRef(false);
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [opening, setOpening] = useState(false);
  const [failedTicket, setFailedTicket] = useState<string | null>(null);
  useEffect(() => { if (selected) heading.current?.focus(); }, [selected?.id]);

  async function loadTickets() {
    setLoading(true);
    setLoadError(false);
    try {
      setTickets(await browserApi<Ticket[]>("/support"));
    } catch (error) {
      if ((error as ApiError).status === 401) setNeedLogin(true);
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTickets(); }, []);

  async function openTicket(id: string) {
    const current = ++request.current;
    setOpening(true);
    setFailedTicket(null);
    setSelected(null);
    setReply("");
    setNotice("");
    try {
      const detail = await browserApi<TicketDetail>(`/support/${id}`);
      if (current === request.current) setSelected(detail);
    } catch {
      if (current === request.current) {
        setNotice("Не удалось открыть обращение.");
        setFailedTicket(id);
      }
    } finally {
      if (current === request.current) setOpening(false);
    }
  }

  async function createTicket() {
    if (mutation.current || !subject.trim() || !message.trim()) return;
    mutation.current = true;
    setBusy(true);
    setNotice("");
    try {
      const created = await browserApi<Ticket>("/support", {
        method: "POST",
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim() }),
      });
      setSubject("");
      setMessage("");
      await loadTickets();
      await openTicket(created.id);

    } catch {
      setNotice("Не удалось создать обращение.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  async function sendReply() {
    if (mutation.current || opening || !selected || !reply.trim()) return;
    mutation.current = true;
    setBusy(true);
    setNotice("");
    try {
      const updated = await browserApi<TicketDetail>(`/support/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      });
      setSelected(updated);
      setReply("");
      await loadTickets();
    } catch {
      setNotice("Не удалось отправить сообщение.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  if (needLogin) return <div className="card booking-login"><h2>Войдите в аккаунт</h2><p>Поддержка доступна после авторизации.</p><a className="btn primary" href="/login">Войти</a></div>;

  return (
    <div className="support-layout">
      <section className="support-sidebar stack">
        <div className="card support-create-card">
          <div className="support-card-head"><div className="support-icon"><PlusIcon /></div><div><span className="eyebrow">Новое обращение</span><h2>Написать в поддержку</h2></div></div>
          <label className="field-label">Тема<select disabled={busy} className="field" value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field-label">Заголовок<input disabled={busy} className="field" maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Кратко опишите вопрос" /></label>
          <label className="field-label">Сообщение<textarea disabled={busy} className="field support-message-field" maxLength={5000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Опишите, что произошло" /></label>
          <div className="support-safety-note"><ShieldExclamationIcon /> Не отправляйте сюда экстренные медицинские сообщения или клинические документы.</div>
          <button className="btn primary" disabled={busy || !subject.trim() || !message.trim()} onClick={createTicket}>{busy ? "Отправляем…" : "Создать обращение"}</button>
        </div>

        <div className="support-ticket-list" aria-busy={loading}>
          {loading && <p role="status">Загрузка обращений…</p>}
          {loadError && <div className="notice error" role="alert">Не удалось загрузить обращения.</div>}
          <button className="btn" disabled={loading || busy} onClick={() => void loadTickets()}>Обновить список</button>
          {tickets.map((ticket) => <button key={ticket.id} disabled={busy} aria-pressed={selected?.id === ticket.id} className={`support-ticket-card ${selected?.id === ticket.id ? "active" : ""}`} onClick={() => openTicket(ticket.id)}><div><b>{ticket.subject}</b><span>{categoryLabels[ticket.category] || ticket.category}</span></div><small>{statusLabels[ticket.status] || ticket.status}</small></button>)}
          {!loading && !loadError && !tickets.length && <div className="card empty-state-modern"><ChatBubbleLeftRightIcon /><h3>Обращений пока нет</h3><p>Создайте обращение, если нужна помощь с платформой.</p></div>}
        </div>
      </section>

      <section className="support-detail-panel">
        {notice && <div className="notice" role="status">{notice}</div>}
        {failedTicket && <button className="btn" disabled={busy || opening} onClick={() => void openTicket(failedTicket)}>Повторить загрузку обращения</button>}
        {opening ? <div className="card" role="status">Загрузка переписки…</div> : selected ? <div className="card support-thread-card">
          <div className="support-thread-head"><div><span className="eyebrow">{categoryLabels[selected.category] || selected.category}</span><h2 ref={heading} tabIndex={-1}>{selected.subject}</h2></div><span className={`status support-${selected.status}`}>{statusLabels[selected.status] || selected.status}</span></div>
          <div className="support-thread-messages">{selected.messages.map((item) => <div className={`support-message ${item.senderRole}`} key={item.id}><b>{item.senderRole === "admin" ? "Поддержка" : "Вы"}</b><p>{item.body}</p><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>)}</div>
          {selected.status !== "closed" && <div className="support-reply-box"><textarea aria-label="Ответ службе поддержки" disabled={busy} className="field" rows={4} maxLength={5000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Ответить службе поддержки" /><button className="btn primary" disabled={busy || !reply.trim()} onClick={sendReply}>Отправить</button></div>}
        </div> : <div className="card empty-state-modern support-empty"><ChatBubbleLeftRightIcon /><h3>Выберите обращение</h3><p>Здесь появится переписка со службой поддержки.</p></div>}
      </section>
    </div>
  );
}
