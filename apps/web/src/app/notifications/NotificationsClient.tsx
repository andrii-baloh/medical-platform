"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { patientRequest as browserApi } from "@/components/patientRequest";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  appointmentId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsClient() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const mutation = useRef(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      setItems(await browserApi<NotificationItem[]>("/notifications"));
    } catch {
      setMessage("Не удалось загрузить уведомления.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function markRead(id?: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      await browserApi(id ? `/notifications/${id}/read` : "/notifications/read-all", { method: "POST", body: "{}" });
      const now = new Date().toISOString();
      setItems(current => current.map(item => !id || item.id === id ? { ...item, readAt: item.readAt ?? now } : item));
    } catch {
      setMessage("Не удалось отметить уведомления. Обновите список перед повтором.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  if (loading) return <div className="card" role="status">Загрузка уведомлений…</div>;

  return (
    <div className="stack notifications-page">
      <div className="between row wrap notifications-toolbar">
        <span className="muted">{items.length ? `Всего: ${items.length}` : "Нет новых событий"}</span>
        {items.some((item) => !item.readAt) && <button className="btn" disabled={busy} onClick={() => void markRead()}>Прочитать все</button>}
      </div>

      {message && <div className="notice error" role="alert">{message} <button className="btn" disabled={busy} onClick={() => void load()}>Обновить список</button></div>}
      {items.map((item) => (
        <article key={item.id} className={`card notification-item ${item.readAt ? "" : "unread"}`}>
          <div className="between row wrap">
            <div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <small className="muted">{new Date(item.createdAt).toLocaleString("ru-RU")}</small>
            </div>
            {!item.readAt && <button className="btn small" disabled={busy} aria-label={`Отметить прочитанным: ${item.title}`} onClick={() => markRead(item.id)}>Прочитано</button>}
          </div>
          {item.appointmentId && <Link className="back" href={`/consultations/${item.appointmentId}`}>Открыть консультацию →</Link>}
          {!item.appointmentId && item.type.startsWith("support.") && <Link className="back" href="/support">Открыть поддержку →</Link>}
        </article>
      ))}
      {!message && !items.length && <div className="card empty">Новых уведомлений пока нет.</div>}
    </div>
  );
}
