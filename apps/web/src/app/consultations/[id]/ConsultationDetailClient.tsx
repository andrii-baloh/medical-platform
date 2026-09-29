"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

function formatInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ResultSection({ result }: { result: SignedResult }) {
  return (
    <section className="card stack signed-result-card">
      <div className="between row wrap">
        <div>
          <div className="eyebrow">Подписанное заключение</div>
          <h2>Версия {result.version}</h2>
        </div>
        <span className="signed-badge">Подписано</span>
      </div>
      <div><b>Жалобы</b><p>{result.complaints || "Не указаны"}</p></div>
      <div><b>Анамнез</b><p>{result.anamnesis || "Не указан"}</p></div>
      <div><b>Заключение</b><p>{result.assessment || "Не указано"}</p></div>
      <div><b>Рекомендации</b><p>{result.recommendations || "Не указаны"}</p></div>
      <details className="technical-result">
        <summary>Идентификатор документа</summary>
        <code>{result.contentSha256}</code>
      </details>
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
    <div className="stack consultation-detail-page">
      <div>
        <Link className="back" href="/consultations">← Мои консультации</Link>
        <h1>{appointment.doctor.fullName}</h1>
        <p className="muted">{appointment.doctor.specialty} · {formatInZone(appointment.startsAt, appointment.patientTimezone)}</p>
      </div>

      <section className="card stack">
        <div className="between row wrap"><b>Пациент</b><span>{appointment.patient.fullName}</span></div>
        <div className="between row wrap"><b>Статус</b><span className={`status status-${appointment.status}`}>{appointment.status}</span></div>
        <div><b>Причина обращения</b><p>{appointment.reason || "Не указана"}</p></div>
      </section>

      {["confirmed", "patient_checked_in", "in_progress"].includes(appointment.status) && (
        <VideoCallPanel appointmentId={appointmentId} startsAt={appointment.startsAt} joinPath={`/video/appointments/${appointmentId}/join`} />
      )}

      {result ? <ResultSection result={result} /> : appointment.status === "completed" ? <div className="notice">Врач ещё не опубликовал подписанное заключение.</div> : null}

      {versions.length > 1 && (
        <section className="card">
          <h3>История подписанных версий</h3>
          <div className="version-list">
            {versions.map((item) => (
              <details key={item.version}>
                <summary>Версия {item.version} · {new Date(item.signedAt).toLocaleString("ru-RU")}</summary>
                <p>{item.assessment || "Без текста заключения"}</p>
                <code>{item.contentSha256}</code>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
