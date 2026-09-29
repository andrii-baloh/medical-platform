"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
      const status = (error as Error & { status?: number }).status;
      if (status === 401) setNeedLogin(true);
      else setMessage("Не удалось загрузить консультации");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function cancel(id: string) {
    try {
      await browserApi(`/appointments/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Отменено пациентом" }),
      });
      await load();
    } catch {
      setMessage("Не удалось отменить запись");
    }
  }

  if (needLogin) {
    return <div className="card"><h2>Войдите в аккаунт</h2><p className="muted">История консультаций доступна только после авторизации.</p><a className="btn primary" href="/login">Войти</a></div>;
  }
  if (loading) return <div className="card">Загрузка…</div>;

  return (
    <div className="stack">
      {message && <div className="notice error">{message}</div>}
      {items.map((appointment) => {
        const when = new Intl.DateTimeFormat("ru-RU", {
          timeZone: appointment.patientTimezone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(appointment.startsAt));
        const cancellable = ["confirmed", "patient_checked_in"].includes(appointment.status);
        return (
          <div className="card" key={appointment.id}>
            <div className="row between wrap">
              <div>
                <span className="chip">{appointment.status}</span>
                <h3 style={{ marginBottom: 4 }}>{appointment.doctor.fullName}</h3>
                <div className="muted">{appointment.doctor.specialty} · {appointment.patient.fullName}</div>
              </div>
              <b>{when}</b>
            </div>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <Link className="btn primary" href={`/consultations/${appointment.id}`}>Открыть консультацию</Link>
              {appointment.status === "completed" && <span className="signed-badge">Заключение доступно после подписания врачом</span>}
              {cancellable && <button className="btn danger" onClick={() => cancel(appointment.id)}>Отменить запись</button>}
            </div>
          </div>
        );
      })}
      {!items.length && (
        <div className="card">
          <h2>Записей пока нет</h2>
          <a className="btn primary" href="/doctors">Найти специалиста</a>
        </div>
      )}
    </div>
  );
}
