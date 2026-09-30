"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDaysIcon, ChevronRightIcon, ClockIcon, UserIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Appointment = {
  id: string;
  status: string;
  startsAt: string;
  patientTimezone: string;
  doctor: { fullName: string; specialty: string };
  patient: { fullName: string };
  price: { amountMinor: number; currency: string };
};

type ApiError = Error & { status?: number };

const labels: Record<string, string> = {
  confirmed: "Подтверждён",
  patient_checked_in: "Пациент подключился",
  in_progress: "Идёт консультация",
  completed: "Завершён",
  cancelled_by_patient: "Отменён пациентом",
  cancelled_by_doctor: "Отменён врачом",
  no_show: "Не состоялся",
};

export function ConsultationsClient() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await browserApi<Appointment[]>("/appointments"));
    } catch (error) {
      if ((error as ApiError).status === 401) setNeedLogin(true);
      else setMessage("Не удалось загрузить консультации.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function cancel(id: string) {
    try {
      await browserApi(`/appointments/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Отменено пациентом" }) });
      await load();
    } catch {
      setMessage("Не удалось отменить запись.");
    }
  }

  if (needLogin) return <div className="card booking-login"><h2>Войдите в аккаунт</h2><p>История консультаций доступна только после авторизации.</p><a className="btn primary" href="/login">Войти</a></div>;
  if (loading) return <div className="card">Загрузка консультаций…</div>;

  return (
    <div className="consultation-modern-list">
      {message && <div className="notice error">{message}</div>}
      {items.map((appointment) => {
        const when = new Intl.DateTimeFormat("ru-RU", { timeZone: appointment.patientTimezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.startsAt));
        const cancellable = ["confirmed", "patient_checked_in"].includes(appointment.status);
        return (
          <article className="consultation-modern-card" key={appointment.id}>
            <div className="consultation-card-main">
              <div className="consultation-avatar">{appointment.doctor.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <div className="grow">
                <div className="row wrap consultation-card-topline"><span className={`status status-${appointment.status}`}>{labels[appointment.status] || appointment.status}</span><span className="consultation-time"><CalendarDaysIcon /> {when}</span></div>
                <h2>{appointment.doctor.fullName}</h2>
                <p>{appointment.doctor.specialty}</p>
                <div className="consultation-meta"><span><UserIcon /> {appointment.patient.fullName}</span><span><ClockIcon /> Онлайн-приём</span></div>
              </div>
            </div>
            <div className="consultation-actions">
              <Link className="btn primary" href={`/consultations/${appointment.id}`}>Открыть <ChevronRightIcon /></Link>
              {cancellable && <button className="btn danger" onClick={() => cancel(appointment.id)}>Отменить</button>}
            </div>
          </article>
        );
      })}
      {!items.length && <div className="card empty-state-modern"><CalendarDaysIcon /><h3>Консультаций пока нет</h3><p>Выберите специалиста и запишитесь на удобное время.</p><Link className="btn primary" href="/doctors">Найти специалиста</Link></div>}
    </div>
  );
}
