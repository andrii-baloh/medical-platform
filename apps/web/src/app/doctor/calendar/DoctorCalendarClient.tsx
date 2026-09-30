"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, ClockIcon, PlusIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";
import { statusLabel } from "@/lib/format";

type Slot = { id: string; startsAt: string; endsAt: string; status: string; appointment?: { id: string; status: string; patientName: string } | null };
type WorkingHour = { id: string; weekday: number; start: string; end: string; timezone: string };
type ApiError = Error & { status?: number };
const weekday = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function DoctorCalendarClient() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const range = useMemo(() => ({ from: new Date().toISOString(), to: new Date(Date.now() + 31 * 86400000).toISOString() }), []);

  async function load() {
    try {
      const [loadedSlots, loadedHours] = await Promise.all([
        browserApi<Slot[]>(`/doctor/slots?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
        browserApi<WorkingHour[]>("/doctor/working-hours"),
      ]);
      setSlots(loadedSlots);
      setHours(loadedHours);
    } catch {
      setMessage("Не удалось загрузить расписание.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await browserApi("/doctor/slots", { method: "POST", body: JSON.stringify({ slots: [{ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }] }) });
      setStart("");
      setEnd("");
      await load();
      setMessage("Свободное время добавлено.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить слот.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(slot: Slot) {
    setBusy(true);
    try {
      await browserApi(`/doctor/slots/${slot.id}/${slot.status === "blocked" ? "unblock" : "block"}`, { method: "POST", body: "{}" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const grouped = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const key = new Date(slot.startsAt).toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" });
    (acc[key] ??= []).push(slot);
    return acc;
  }, {});

  return (
    <main className="doctor-content doctor-calendar-v2">
      <div className="doctor-heading doctor-heading-v2"><div><span className="eyebrow">Расписание</span><h1>Рабочий календарь</h1><p>Управляйте конкретными интервалами, доступными для записи пациента.</p></div></div>
      {message && <div className="notice">{message}</div>}

      <section className="calendar-layout calendar-layout-v2">
        <div className="stack">
          {Object.entries(grouped).map(([day, daySlots]) => <section className="doctor-day-card" key={day}>
            <div className="doctor-day-title"><CalendarDaysIcon /><h2 className="capitalize">{day}</h2><span>{daySlots.length}</span></div>
            <div className="slot-list slot-list-v2">
              {daySlots.map((slot) => <div className="doctor-slot doctor-slot-v2" key={slot.id}>
                <div className="doctor-slot-time"><ClockIcon /><span><b>{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt))}–{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(slot.endsAt))}</b><small>{statusLabel(slot.status)}</small></span></div>
                {slot.appointment ? <Link className="btn small primary" href={`/doctor/appointments/${slot.appointment.id}`}>{slot.appointment.patientName}</Link> : <button disabled={busy} className="btn small" onClick={() => toggle(slot)}>{slot.status === "blocked" ? "Открыть" : "Закрыть"}</button>}
              </div>)}
            </div>
          </section>)}
          {slots.length === 0 && <div className="card empty-state-modern"><CalendarDaysIcon /><h3>Свободных слотов пока нет</h3><p>Добавьте первый интервал справа.</p></div>}
        </div>

        <aside className="stack calendar-side-v2">
          <form className="card doctor-create-slot" onSubmit={create}><div className="doctor-card-title"><PlusIcon /><div><span className="eyebrow">Новый слот</span><h3>Добавить время</h3></div></div><label>Начало<input className="field" type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Окончание<input className="field" type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} /></label><button disabled={busy} className="btn primary">Добавить слот</button></form>
          <div className="card doctor-hours-card"><span className="eyebrow">Шаблон</span><h3>Обычные рабочие часы</h3><div className="stack compact">{hours.map((hour) => <div className="between row" key={hour.id}><span>{weekday[hour.weekday]}</span><b>{hour.start}–{hour.end}</b></div>)}</div><p>Рабочие часы — только шаблон. Запись возможна в созданный свободный слот.</p></div>
        </aside>
      </section>
    </main>
  );
}
