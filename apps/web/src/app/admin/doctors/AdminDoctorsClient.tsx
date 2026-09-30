"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckBadgeIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Doctor = {
  id: string;
  fullName: string;
  specialty: string;
  verified: boolean;
  published: boolean;
  countryCode?: string | null;
  experienceYears: number;
  accountEmail?: string | null;
  price: { amountMinor: number; currency: string };
};

export function AdminDoctorsClient() {
  const [items, setItems] = useState<Doctor[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    try { setItems(await browserApi<Doctor[]>("/admin/doctors")); }
    catch (error) { setMessage((error as Error & { status?: number }).status === 403 ? "Нет доступа администратора." : "Не удалось загрузить врачей."); }
  }
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => items.filter((doctor) =>
    `${doctor.fullName} ${doctor.specialty} ${doctor.accountEmail ?? ""}`.toLowerCase().includes(query.toLowerCase())
  ), [items, query]);

  async function patch(doctor: Doctor, body: { verified?: boolean; published?: boolean }) {
    setBusyId(doctor.id);
    setMessage("");
    try {
      await browserApi(`/admin/doctors/${doctor.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch { setMessage("Не удалось изменить статус врача."); }
    finally { setBusyId(""); }
  }

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Специалисты</span><h1>Верификация врачей</h1><p>Публикация профиля доступна отдельно от подтверждения профессионального статуса.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, специальность или email" /></label>
      {message && <div className="notice error">{message}</div>}
      <div className="admin-table-card">
        <div className="admin-table admin-doctors-table">
          <div className="admin-table-head"><span>Врач</span><span>Специальность</span><span>Верификация</span><span>Публикация</span></div>
          {shown.map((doctor) => <div className="admin-table-row" key={doctor.id}>
            <div><b>{doctor.fullName}</b><small>{doctor.accountEmail || "Аккаунт не связан"} · {doctor.countryCode || "—"}</small></div>
            <div><b>{doctor.specialty}</b><small>Стаж {doctor.experienceYears} лет</small></div>
            <button disabled={busyId === doctor.id} className={`admin-state-btn ${doctor.verified ? "ok" : ""}`} onClick={() => patch(doctor, { verified: !doctor.verified })}><CheckBadgeIcon /> {doctor.verified ? "Подтверждён" : "Подтвердить"}</button>
            <button disabled={busyId === doctor.id} className={`admin-state-btn ${doctor.published ? "ok" : ""}`} onClick={() => patch(doctor, { published: !doctor.published })}>{doctor.published ? "Опубликован" : "Скрыт"}</button>
          </div>)}
        </div>
        {!shown.length && <div className="empty">Врачи не найдены.</div>}
      </div>
    </main>
  );
}
