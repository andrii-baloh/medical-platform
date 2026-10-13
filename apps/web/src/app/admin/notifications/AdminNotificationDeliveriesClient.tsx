"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useStaffResource, StaffLoadState } from "@/components/StaffRequest";

type Delivery = {
  id: string;
  notificationId: string;
  notificationType: string;
  channel: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  attempts: number;
  userEmail: string | null;
  sentAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export function AdminNotificationDeliveriesClient() {
  const { data: loaded, loading, error, reload } = useStaffResource<Delivery[]>("/admin/notification-deliveries");
  const items = loaded ?? [];
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.userEmail ?? ""} ${item.notificationType} ${item.status} ${item.provider ?? ""} ${item.id}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Коммуникации</span><h1>Доставка уведомлений</h1><p>Технический журнал исходящих уведомлений. Медицинский текст здесь не отображается.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input aria-label="Поиск по списку" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email, тип, статус, провайдер или ID" /></label>
      <StaffLoadState loading={loading} error={error} retry={reload} />
      <div className="admin-table-card">
        <div className="admin-table admin-notifications-table">
          <div className="admin-table-head"><span>Получатель</span><span>Событие</span><span>Статус</span><span>Доставка</span></div>
          {shown.map((item) => <div className="admin-table-row" key={item.id}>
            <div><b>{item.userEmail || "Email отсутствует"}</b><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>
            <div><b>{item.notificationType}</b><small>{item.channel}</small></div>
            <div><span className={`payment-state payment-${item.status}`}>{item.status}</span><small>Попыток: {item.attempts}</small></div>
            <div><b>{item.provider || "—"}</b><small>{item.sentAt ? `Отправлено ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.sentAt))}` : item.lastErrorCode || item.providerMessageId || "Ожидает обработки"}</small></div>
          </div>)}
        </div>
        {!loading && !error && !shown.length && <div className="empty">Записи доставки не найдены.</div>}
      </div>
    </main>
  );
}
