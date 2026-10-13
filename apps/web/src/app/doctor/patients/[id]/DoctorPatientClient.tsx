"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeftIcon, CalendarDaysIcon, DocumentTextIcon, UserIcon } from "@heroicons/react/24/outline";
import { staffRequest as browserApi, useStaffResource, StaffLoadState } from "@/components/StaffRequest";
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

type MedicalRecord = {
  id: string;
  diagnoses: Array<{ id: string; display: string; code?: string | null; clinical_status: string }>;
  allergies: Array<{ id: string; allergen: string; reaction?: string | null; severity?: string | null; clinical_status: string }>;
  medications: Array<{ id: string; medication_name: string; dosage?: string | null; frequency?: string | null; clinical_status: string }>;
  tests: Array<{ id: string; test_name: string; status: string; result_text?: string | null }>;
};

export function DoctorPatientClient({ patientId }: { patientId: string }) {
  const { data: loaded, loading, error, reload } = useStaffResource<Data>(`/doctor/patients/${patientId}`);
  const { data: medicalRecord, loading: recordLoading } = useStaffResource<MedicalRecord>(`/medical-records/patient/${patientId}`);
  const data = loaded;

  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function openDoc(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await browserApi<{ url: string }>(`/documents/${id}/download-url`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch { setMessage("Не удалось открыть документ."); }
    finally { lock.current = false; setBusy(false); }
  }

  if (!data) return <main className="doctor-content"><StaffLoadState loading={loading} error={error} retry={reload} /></main>;

  return (
    <main className="doctor-content doctor-patient-detail-v2">
      {message && <div role="alert" className="notice error">{message}</div>}
      <Link className="back-link-modern doctor-back-link" href="/doctor/patients"><ArrowLeftIcon /> Пациенты</Link>

      <section className="doctor-patient-hero">
        <div className="avatar xl">{data.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
        <div className="grow"><span className="eyebrow">Карточка пациента</span><h1>{data.fullName}</h1><div className="doctor-patient-meta"><span><UserIcon /> {formatDate(data.birthDate)}</span><span>{data.sex || "пол не указан"}</span><span>{data.relationToOwner}</span></div></div>
      </section>

      <section className="card">
        <div className="section-row doctor-section-row"><div><span className="eyebrow">Медицинская карта</span><h2>Клинические данные</h2></div></div>
        {recordLoading && !medicalRecord ? <p>Загрузка медицинской карты…</p> : medicalRecord ? (
          <div className="patient-detail-grid patient-detail-grid-v2">
            <div className="stack">
              <div><b>Диагнозы</b>{medicalRecord.diagnoses.length ? medicalRecord.diagnoses.map((x) => <p key={x.id}>{x.display}{x.code ? ` · ${x.code}` : ""} · {x.clinical_status}</p>) : <p>Нет записей</p>}</div>
              <div><b>Аллергии</b>{medicalRecord.allergies.length ? medicalRecord.allergies.map((x) => <p key={x.id}>{x.allergen}{x.reaction ? ` · ${x.reaction}` : ""}{x.severity ? ` · ${x.severity}` : ""}</p>) : <p>Нет записей</p>}</div>
            </div>
            <div className="stack">
              <div><b>Лекарства</b>{medicalRecord.medications.length ? medicalRecord.medications.map((x) => <p key={x.id}>{x.medication_name}{x.dosage ? ` · ${x.dosage}` : ""}{x.frequency ? ` · ${x.frequency}` : ""} · {x.clinical_status}</p>) : <p>Нет записей</p>}</div>
              <div><b>Исследования</b>{medicalRecord.tests.length ? medicalRecord.tests.map((x) => <p key={x.id}>{x.test_name} · {x.status}{x.result_text ? ` · ${x.result_text}` : ""}</p>) : <p>Нет записей</p>}</div>
            </div>
          </div>
        ) : <p>Медицинская карта недоступна.</p>}
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
            {data.documents.map((document) => <button disabled={busy} className="doctor-document-card" key={document.id} onClick={() => openDoc(document.id)}><div className="doctor-history-icon"><DocumentTextIcon /></div><div className="grow"><b>{document.originalName}</b><span>{document.category} · {Math.ceil(document.sizeBytes / 1024)} КБ</span></div></button>)}
            {!data.documents.length && <div className="card empty-state-modern"><DocumentTextIcon /><h3>Нет разрешённых документов</h3><p>Пациент не предоставил доступ к файлам.</p></div>}
          </div>
        </aside>
      </div>
    </main>
  );
}
