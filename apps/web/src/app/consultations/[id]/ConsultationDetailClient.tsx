"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, CalendarDaysIcon, CheckBadgeIcon, ClockIcon, DocumentCheckIcon, UserIcon } from "@heroicons/react/24/outline";
import { VideoCallPanel } from "@/components/VideoCallPanel";
import { browserApi } from "@/lib/api";

type Appointment = {
  id: string;
  status: string;
  reason?: string | null;
  startsAt: string;
  endsAt: string;
  patientTimezone: string;
  doctor: { id: string; slug: string; fullName: string; specialty: string };
  patient: { id: string; fullName: string; birthDate?: string | null; relationToOwner?: string };
  price: { amountMinor: number; currency: string };
};

type SignedResult = {
  appointmentId: string;
  doctor: { id: string; fullName: string; specialty: string | null };
  patient: { id: string; fullName: string };
  version: number;
  signedAt: string;
  complaints: string;
  anamnesis: string;
  assessment: string;
  recommendations: string;
  contentSha256: string;
  previousVersionSha256: string | null;
};

const statusLabels: Record<string, string> = {
  confirmed: "Подтверждён",
  patient_checked_in: "Пациент подключился",
  in_progress: "Идёт консультация",
  completed: "Завершён",
  cancelled_by_patient: "Отменён пациентом",
  cancelled_by_doctor: "Отменён врачом",
  no_show: "Не состоялся",
};

function formatInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function ResultSection({ result }: { result: SignedResult }) {
  const sections = [
    ["Жалобы", result.complaints || "Не указаны"],
    ["Анамнез", result.anamnesis || "Не указан"],
    ["Заключение", result.assessment || "Не указано"],
    ["Рекомендации", result.recommendations || "Не указаны"],
  ];
  return (
    <section className="signed-result-modern">
      <div className="signed-result-header">
        <div className="signed-result-icon"><DocumentCheckIcon /></div>
        <div><span className="eyebrow">Медицинское заключение</span><h2>Версия {result.version}</h2><p>Подписано {new Date(result.signedAt).toLocaleString("ru-RU")}</p></div>
        <span className="signed-badge"><CheckBadgeIcon /> Подписано</span>
      </div>
      <div className="signed-result-sections">
        {sections.map(([title, value]) => <div key={title}><b>{title}</b><p>{value}</p></div>)}
      </div>
      <details className="technical-result"><summary>Технический идентификатор документа</summary><code>{result.contentSha256}</code></details>
    </section>
  );
}

export function ConsultationDetailClient({ appointmentId }: { appointmentId: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [result, setResult] = useState<SignedResult | null>(null);
  const [versions, setVersions] = useState<SignedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const appt = await browserApi<Appointment>(`/appointments/${appointmentId}`);
        if (!active) return;
        setAppointment(appt);
        const latest = await browserApi<SignedResult>(`/appointments/${appointmentId}/result`).catch(() => null);
        if (!active) return;
        setResult(latest);
        if (latest) {
          const all = await browserApi<SignedResult[]>(`/appointments/${appointmentId}/result/versions`).catch(() => []);
          if (active) setVersions(all);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Не удалось открыть консультацию.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [appointmentId]);

  if (loading) return <div className="card">Загрузка консультации…</div>;
  if (!appointment) return <div className="notice error">{message || "Консультация не найдена."}</div>;

  return (
    <div className="consultation-detail-modern">
      <Link className="back-link-modern" href="/consultations"><ArrowLeftIcon /> Мои консультации</Link>

      <section className="consultation-detail-hero">
        <div className="consultation-avatar large">{appointment.doctor.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
        <div className="grow"><span className="doctor-specialty">{appointment.doctor.specialty}</span><h1>{appointment.doctor.fullName}</h1><div className="consultation-detail-meta"><span><CalendarDaysIcon /> {formatInZone(appointment.startsAt, appointment.patientTimezone)}</span><span><UserIcon /> {appointment.patient.fullName}</span><span><ClockIcon /> Онлайн</span></div></div>
        <span className={`status status-${appointment.status}`}>{statusLabels[appointment.status] || appointment.status}</span>
      </section>

      <section className="card consultation-reason-card"><span className="eyebrow">Причина обращения</span><p>{appointment.reason || "Не указана"}</p></section>

      {["confirmed", "patient_checked_in", "in_progress"].includes(appointment.status) && <VideoCallPanel appointmentId={appointmentId} startsAt={appointment.startsAt} joinPath={`/video/appointments/${appointmentId}/join`} />}

      {result ? <ResultSection result={result} /> : appointment.status === "completed" ? <div className="notice">Врач ещё не опубликовал подписанное заключение.</div> : null}

      {versions.length > 1 && <section className="card result-history-card"><span className="eyebrow">История</span><h2>Подписанные версии</h2><div className="version-list">{versions.map((item) => <details key={item.version}><summary>Версия {item.version} · {new Date(item.signedAt).toLocaleString("ru-RU")}</summary><p>{item.assessment || "Без текста заключения"}</p><code>{item.contentSha256}</code></details>)}</div></section>}
    </div>
  );
}
