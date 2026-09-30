"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, CalendarDaysIcon, DocumentTextIcon, UserIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";

type Data = {
  id: string;
  fullName: string;
  birthDate?: string | null;
  sex?: string | null;
  relationToOwner: string;
  appointments: Array<{ id: string; status: string; reason?: string | null; startsAt: string; endsAt: string }>;
  documents: Array<{ id: string; originalName: string; category: string; sizeBytes: number; createdAt: string }>;
};

export function DoctorPatientClient({ patientId }: { patientId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    browserApi<Data>(`/doctor/patients/${patientId}`).then(setData).catch(() => setError("Карточка пациента недоступна."));
  }, [patientId]);

  async function openDoc(id: string) {
    const result = await browserApi<{ url: string }>(`/documents/${id}/download-url`);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  if (error) return <main className="doctor-content"><div className="notice error">{error}</div></main>;
  if (!data) return <main className="doctor-content"><div className="card">Загрузка карточки пациента…</div></main>;

  return (
    <main className="doctor-content doctor-patient-detail-v2">
      <Link className="back-link-modern doctor-back-link" href="/doctor/patients"><ArrowLeftIcon /> Пациенты</Link>

      <section className="doctor-patient-hero">
        <div className="avatar xl">{data.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
        <div className="grow"><span className="eyebrow">Карточка пациента</span><h1>{data.fullName}</h1><div className="doctor-patient-meta"><span><UserIcon /> {formatDate(data.birthDate)}</span><span>{data.sex || "пол не указан"}</span><span>{data.relationToOwner}</span></div></div>
      </section>

      <div className="patient-detail-grid patient-detail-grid-v2">
        <section>
          <div className="section-row doctor-section-row"><div><span className="eyebrow">История</span><h2>Консультации</h2></div><span className="count-pill">{data.appointments.length}</span></div>
          <div className="stack">
            {data.appointments.map((appointment) => <Link className="doctor-history-card" href={`/doctor/appointments/${appointment.id}`} key={appointment.id}><div className="doctor-history-icon"><CalendarDaysIcon /></div><div className="grow"><b>{formatDateTime(appointment.startsAt)}</b><p>{appointment.reason || "Причина обращения не указана"}</p></div><span className={`status status-${appointment.status}`}>{statusLabel(appointment.status)}</span></Link>)}
            {!data.appointments.length && <div className="card empty-state-modern"><CalendarDaysIcon /><h3>История пока пуста</h3></div>}
          </div>
        </section>

        <aside>
          <div className="section-row doctor-section-row"><div><span className="eyebrow">Доступ</span><h2>Документы</h2></div><span className="count-pill">{data.documents.length}</span></div>
          <div className="stack">
            {data.documents.map((document) => <button className="doctor-document-card" key={document.id} onClick={() => openDoc(document.id)}><div className="doctor-history-icon"><DocumentTextIcon /></div><div className="grow"><b>{document.originalName}</b><span>{document.category} · {Math.ceil(document.sizeBytes / 1024)} КБ</span></div></button>)}
            {!data.documents.length && <div className="card empty-state-modern"><DocumentTextIcon /><h3>Нет разрешённых документов</h3><p>Пациент не предоставил доступ к файлам.</p></div>}
          </div>
        </aside>
      </div>
    </main>
  );
}
