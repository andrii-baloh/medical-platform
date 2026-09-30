"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api";

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

  async function load() {
    setLoading(true);
    try {
      setItems(await browserApi<NotificationItem[]>("/notifications"));
    } catch {
      setMessage("Не удалось загрузить уведомления.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function markRead(id: string) {
    await browserApi(`/notifications/${id}/read`, { method: "POST", body: "{}" });
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
  }

  async function markAllRead() {
    await browserApi("/notifications/read-all", { method: "POST", body: "{}" });
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
  }

  if (loading) return <div className="card">Загрузка уведомлений…</div>;

  return (
    <div className="stack notifications-page">
      <div className="between row wrap notifications-toolbar">
        <span className="muted">{items.length ? `Всего: ${items.length}` : "Нет новых событий"}</span>
        {items.some((item) => !item.readAt) && <button className="btn" onClick={markAllRead}>Прочитать все</button>}
      </div>

      {message && <div className="notice error">{message}</div>}
      {items.map((item) => (
        <article key={item.id} className={`card notification-item ${item.readAt ? "" : "unread"}`}>
          <div className="between row wrap">
            <div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <small className="muted">{new Date(item.createdAt).toLocaleString("ru-RU")}</small>
            </div>
            {!item.readAt && <button className="btn small" onClick={() => markRead(item.id)}>Прочитано</button>}
          </div>
          {item.appointmentId && <Link className="back" href={`/consultations/${item.appointmentId}`}>Открыть консультацию →</Link>}
          {!item.appointmentId && item.type.startsWith("support.") && <Link className="back" href="/support">Открыть поддержку →</Link>}
        </article>
      ))}
      {!items.length && <div className="card empty">Новых уведомлений пока нет.</div>}
    </div>
  );
}
