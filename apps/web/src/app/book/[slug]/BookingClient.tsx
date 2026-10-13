"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircleIcon, ClockIcon, UserIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Slot = { id: string; doctorId: string; startsAt: string; endsAt: string; price: { amountMinor: number; currency: string } };
type Me = { timezone: string; patientProfiles: { id: string; fullName: string }[] };
type BookingResult = { id: string; status: string; startsAt: string; endsAt: string; price: { amountMinor: number; currency: string } };
type Payment = { id: string; provider: string; status: string; checkoutUrl: string | null; amountMinor: number; currency: string };
type ApiError = Error & { status?: number };

export function BookingClient({ slug }: { slug: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [slotId, setSlotId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [success, setSuccess] = useState<BookingResult | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/backend/doctors/${slug}/slots`).then(async (response) => {
        if (!response.ok) throw new Error("slots");
        return response.json() as Promise<Slot[]>;
      }),
      browserApi<Me>("/me"),
    ]).then(([loadedSlots, profile]) => {
      setSlots(loadedSlots);
      setMe(profile);
      setSlotId(loadedSlots[0]?.id ?? "");
      setPatientId(profile.patientProfiles[0]?.id ?? "");
    }).catch((error: ApiError) => {
      if (error.status === 401) setNeedLogin(true);
      else setMessage("Не удалось загрузить данные для записи.");
    });
  }, [slug]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slots) {
      const day = new Intl.DateTimeFormat("ru-RU", { timeZone: me?.timezone || "UTC", weekday: "long", day: "2-digit", month: "long" }).format(new Date(slot.startsAt));
      groups.set(day, [...(groups.get(day) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots, me]);

  async function book() {
    if (!slotId || !patientId || !me) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await browserApi<BookingResult>("/appointments", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ slotId, patientProfileId: patientId, reason, timezone: me.timezone }),
      });
      setSuccess(result);
    } catch (error) {
      const status = (error as ApiError).status;
      setMessage(status === 409 ? "Это время уже занято. Выберите другое." : "Не удалось создать запись.");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!success) return;
    setPayBusy(true);
    setMessage("");
    try {
      const created = await browserApi<Payment>(`/payments/appointments/${success.id}/session`, { method: "POST", body: "{}" });
      setPayment(created);
      if (created.checkoutUrl) window.location.assign(created.checkoutUrl);
    } catch {
      setMessage("Запись создана, но платёжную сессию открыть не удалось.");
    } finally {
      setPayBusy(false);
    }
  }

  if (needLogin) return <div className="card booking-login"><h2>Войдите в аккаунт</h2><p>Для записи на консультацию нужен защищённый профиль пациента.</p><a className="btn primary" href="/login">Войти</a></div>;

  if (success && me) {
    return (
      <div className="booking-success card">
        <CheckCircleIcon />
        <span className="eyebrow">Запись подтверждена</span>
        <h2>Консультация добавлена в ваш кабинет</h2>
        <p>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: me.timezone }).format(new Date(success.startsAt))}</p>
        {!payment && <button className="btn primary" disabled={payBusy} onClick={pay}>{payBusy ? "Подготовка оплаты…" : "Перейти к оплате"}</button>}
        {payment?.checkoutUrl && <a className="btn primary" href={payment.checkoutUrl}>Открыть страницу оплаты</a>}
        {payment?.provider === "development" && <div className="notice">Платёжная сессия создана в тестовом режиме. Реального списания денег нет.</div>}
        {message && <div className="notice error">{message}</div>}
        <div className="row wrap"><a className="btn" href={`/consultations/${success.id}`}>Открыть консультацию</a><a className="btn" href="/consultations">Все приёмы</a></div>
      </div>
    );
  }

  return (
    <div className="booking-layout">
      <div className="booking-main stack">
        <section className="card booking-step">
          <div className="booking-step-head"><span>1</span><div><h2>Кто идёт на приём</h2><p>Выберите профиль пациента</p></div></div>
          <label className="field-label"><UserIcon /> Пациент<select className="field" value={patientId} onChange={(event) => setPatientId(event.target.value)}>{me?.patientProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.fullName}</option>)}</select></label>
        </section>

        <section className="card booking-step">
          <div className="booking-step-head"><span>2</span><div><h2>Выберите время</h2><p>Показываем время в часовом поясе вашего профиля</p></div></div>
          {grouped.map(([day, daySlots]) => <div className="booking-day" key={day}><b>{day}</b><div className="slots">{daySlots.map((slot) => <button type="button" key={slot.id} className={`slot ${slotId === slot.id ? "active" : ""}`} onClick={() => setSlotId(slot.id)}><ClockIcon />{new Intl.DateTimeFormat("ru-RU", { timeZone: me?.timezone || "UTC", hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt))}</button>)}</div></div>)}
          {!grouped.length && <div className="empty-state-inline">Свободных интервалов пока нет.</div>}
        </section>

        <section className="card booking-step">
          <div className="booking-step-head"><span>3</span><div><h2>Причина обращения</h2><p>Кратко опишите вопрос для врача</p></div></div>
          <textarea className="field booking-reason" rows={6} maxLength={4000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: хочу обсудить результаты обследования и дальнейшие шаги" />
        </section>
      </div>

      <aside className="card booking-summary">
        <span className="eyebrow">Подтверждение</span>
        <h2>Запись на консультацию</h2>
        <p>После подтверждения приём появится в разделе «Мои приёмы».</p>
        <button className="btn primary" disabled={busy || !slotId || !patientId} onClick={book}>{busy ? "Создаём запись…" : "Подтвердить запись"}</button>
        {message && <div className="notice error">{message}</div>}
      </aside>
    </div>
  );
}
