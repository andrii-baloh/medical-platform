"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";
import { statusLabel } from "@/lib/format";

type Appointment = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  doctor: { id: string; fullName: string };
  patient: { id: string; fullName: string };
  price: { amountMinor: number; currency: string };
  patientTimezone: string;
  createdAt: string;
};

export function AdminAppointmentsClient() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    browserApi<Appointment[]>("/admin/appointments").then(setItems).catch((error: Error & { status?: number }) => {
      setMessage(error.status === 403 ? "Нет доступа администратора." : "Не удалось загрузить записи.");
    });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.doctor.fullName} ${item.patient.fullName} ${item.status} ${item.id}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Консультации</span><h1>Все записи</h1><p>Операционный контроль без доступа к медицинским жалобам, анамнезу и заключениям.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Врач, пациент, статус или ID" /></label>
      {message && <div className="notice error">{message}</div>}
      <div className="admin-table-card">
        <div className="admin-table admin-appointments-table">
          <div className="admin-table-head"><span>Дата</span><span>Врач / пациент</span><span>Статус</span><span>Стоимость</span></div>
          {shown.map((item) => <div className="admin-table-row" key={item.id}>
            <div><b>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.startsAt))}</b><small>{item.id}</small></div>
            <div><b>{item.doctor.fullName}</b><small>{item.patient.fullName}</small></div>
            <div><span className={`status status-${item.status}`}>{statusLabel(item.status)}</span></div>
            <div><b>{new Intl.NumberFormat("ru-RU", { style: "currency", currency: item.price.currency }).format(item.price.amountMinor / 100)}</b><small>{item.patientTimezone}</small></div>
          </div>)}
        </div>
        {!shown.length && <div className="empty">Записи не найдены.</div>}
      </div>
    </main>
  );
}
