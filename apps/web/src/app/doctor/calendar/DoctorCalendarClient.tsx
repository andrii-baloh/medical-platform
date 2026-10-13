"use client";

import Link from "next/link";
import { FormEvent, useRef, useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, ClockIcon, PlusIcon } from "@heroicons/react/24/outline";
import { staffRequest as browserApi, StaffLoadState } from "@/components/StaffRequest";
import { statusLabel } from "@/lib/format";

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  price: { amountMinor: number; currency: string };
  serviceOffer?: { id: string; title: string } | null;
  appointment?: { id: string; status: string; patientName: string } | null;
};
type WorkingHour = { id: string; weekday: number; start: string; end: string; timezone: string };
type ServiceOffer = {
  id: string;
  title: string;
  serviceName: string;
  organizationName: string;
  licenseNumber: string;
  priceMinor: number;
  currency: string;
};
const weekday = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function DoctorCalendarClient() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [serviceOfferId, setServiceOfferId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const request = useRef(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const range = useMemo(() => ({ from: new Date().toISOString(), to: new Date(Date.now() + 31 * 86400000).toISOString() }), []);

  async function load() {
    const current = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      const [loadedSlots, loadedHours, loadedOffers] = await Promise.all([
        browserApi<Slot[]>(`/doctor/slots?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
        browserApi<WorkingHour[]>("/doctor/working-hours"),
        browserApi<ServiceOffer[]>("/commercial-services/doctor/offers"),
      ]);
      if (current !== request.current) return false;
      setSlots(loadedSlots);
      setHours(loadedHours);
      setOffers(loadedOffers);
      setServiceOfferId((value) => value && loadedOffers.some((offer) => offer.id === value) ? value : loadedOffers[0]?.id ?? "");
      return true;
    } catch {
      if (current === request.current) setLoadError("Не удалось загрузить расписание.");
      return false;
    } finally { if (current === request.current) setLoading(false); }
  }

  useEffect(() => { void load(); return () => { request.current++; }; }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (mutation.current || loading || loadError) return;
    mutation.current = true;
    setBusy(true);
    setMessage("");
    try {
      await browserApi("/doctor/slots", {
        method: "POST",
        body: JSON.stringify({
          ...(serviceOfferId ? { serviceOfferId } : {}),
          slots: [{ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }],
        }),
      });
      setStart("");
      setEnd("");
      const refreshed = await load();
      setMessage(refreshed ? "Свободное время добавлено." : "Время добавлено. Обновите расписание перед следующим действием.");
    } catch {
      setMessage("Не удалось добавить слот. Проверьте даты, коммерческое предложение и обновите расписание перед повтором.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  async function toggle(slot: Slot) {
    setMessage("");
    if (mutation.current || loading || loadError) return;
    mutation.current = true;
    setBusy(true);
    try {
      await browserApi(`/doctor/slots/${slot.id}/${slot.status === "blocked" ? "unblock" : "block"}`, { method: "POST", body: "{}" });
      await load();
    } catch {
      setMessage("Не удалось изменить слот. Обновите расписание перед повтором.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  const grouped = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const key = new Date(slot.startsAt).toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" });
    (acc[key] ??= []).push(slot);
    return acc;
  }, {});
  const selectedOffer = offers.find((offer) => offer.id === serviceOfferId) ?? null;

  return (
    <main className="doctor-content doctor-calendar-v2">
      <div className="doctor-heading doctor-heading-v2"><div><span className="eyebrow">Расписание</span><h1>Рабочий календарь</h1><p>Управляйте конкретными интервалами, доступными для записи пациента.</p></div></div>
      <StaffLoadState loading={loading} error={loadError} retry={() => void load()} />
      {message && <div role="alert" className="notice">{message}</div>}

      <section className="calendar-layout calendar-layout-v2">
        <div className="stack">
          {!loading && !loadError && Object.entries(grouped).map(([day, daySlots]) => <section className="doctor-day-card" key={day}>
            <div className="doctor-day-title"><CalendarDaysIcon /><h2 className="capitalize">{day}</h2><span>{daySlots.length}</span></div>
            <div className="slot-list slot-list-v2">
              {daySlots.map((slot) => <div className="doctor-slot doctor-slot-v2" key={slot.id}>
                <div className="doctor-slot-time"><ClockIcon /><span><b>{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt))}–{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(slot.endsAt))}</b><small>{statusLabel(slot.status)}{slot.serviceOffer ? ` · ${slot.serviceOffer.title}` : " · без коммерческого предложения"}</small></span></div>
                {slot.appointment ? <Link className="btn small primary" href={`/doctor/appointments/${slot.appointment.id}`}>{slot.appointment.patientName}</Link> : <button disabled={busy || loading || Boolean(loadError)} aria-label={`${slot.status === "blocked" ? "Открыть" : "Закрыть"} слот ${new Date(slot.startsAt).toLocaleString("ru-RU")}`} className="btn small" onClick={() => toggle(slot)}>{slot.status === "blocked" ? "Открыть" : "Закрыть"}</button>}
              </div>)}
            </div>
          </section>)}
          {!loading && !loadError && slots.length === 0 && <div className="card empty-state-modern"><CalendarDaysIcon /><h3>Свободных слотов пока нет</h3><p>Добавьте первый интервал справа.</p></div>}
        </div>

        <aside className="stack calendar-side-v2">
          <form className="card doctor-create-slot" onSubmit={create}>
            <div className="doctor-card-title"><PlusIcon /><div><span className="eyebrow">Новый слот</span><h3>Добавить время</h3></div></div>
            {offers.length > 0 ? <label>Платная медицинская услуга<select disabled={busy} className="field" value={serviceOfferId} onChange={(event) => setServiceOfferId(event.target.value)} required>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.title} · {(offer.priceMinor / 100).toLocaleString("ru-RU", { style: "currency", currency: offer.currency })}</option>)}</select></label> : <div className="notice">Коммерческое предложение ещё не настроено администратором. Слот можно создать, но оплата по нему будет недоступна до настройки юридического слоя.</div>}
            {selectedOffer && <div className="tiny muted">{selectedOffer.organizationName} · лицензия {selectedOffer.licenseNumber} · {selectedOffer.serviceName}</div>}
            <label>Начало<input disabled={busy} className="field" type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label>Окончание<input disabled={busy} className="field" type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
            <button disabled={busy || loading || Boolean(loadError)} className="btn primary">Добавить слот</button>
          </form>
          <div className="card doctor-hours-card"><span className="eyebrow">Шаблон</span><h3>Обычные рабочие часы</h3><div className="stack compact">{!loading && !loadError && hours.map((hour) => <div className="between row" key={hour.id}><span>{weekday[hour.weekday]}</span><b>{hour.start}–{hour.end}</b></div>)}</div>{!loading && !loadError && !hours.length && <p>Рабочие часы не заданы.</p>}<p>Рабочие часы — только шаблон. Запись возможна в созданный свободный слот.</p></div>
        </aside>
      </section>
    </main>
  );
}
