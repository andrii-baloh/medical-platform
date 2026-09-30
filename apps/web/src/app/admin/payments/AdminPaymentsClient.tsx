"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Payment = {
  id: string;
  appointmentId: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  doctorName: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

function money(item: Payment) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: item.currency }).format(item.amountMinor / 100);
}

export function AdminPaymentsClient() {
  const [items, setItems] = useState<Payment[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    browserApi<Payment[]>("/admin/payments").then(setItems).catch((error: Error & { status?: number }) => {
      setMessage(error.status === 403 ? "Нет доступа администратора." : "Не удалось загрузить платежи.");
    });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.doctorName} ${item.patientName} ${item.status} ${item.provider} ${item.id}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Финансы</span><h1>Платежи</h1><p>Статусы платежей и техническая сверка. Карточные данные платформа не хранит.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пациент, врач, статус, провайдер или ID" /></label>
      {message && <div className="notice error">{message}</div>}
      <div className="admin-table-card">
        <div className="admin-table admin-payments-table">
          <div className="admin-table-head"><span>Платёж</span><span>Участники</span><span>Статус</span><span>Сумма</span></div>
          {shown.map((item) => <div className="admin-table-row" key={item.id}>
            <div><b>{item.provider}</b><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>
            <div><b>{item.patientName}</b><small>{item.doctorName}</small></div>
            <div><span className={`payment-state payment-${item.status}`}>{item.status}</span></div>
            <div><b>{money(item)}</b><small>{item.paidAt ? `Оплачено ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.paidAt))}` : item.appointmentId}</small></div>
          </div>)}
        </div>
        {!shown.length && <div className="empty">Платежи не найдены.</div>}
      </div>
    </main>
  );
}
