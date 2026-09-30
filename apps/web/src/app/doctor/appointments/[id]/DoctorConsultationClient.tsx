"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, DocumentTextIcon, UserIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";
import { VideoCallPanel } from "@/components/VideoCallPanel";
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";

type Consultation = { id: string; version: number; complaints?: string | null; anamnesis?: string | null; assessment?: string | null; recommendations?: string | null; signedAt?: string | null };
type Data = { id: string; status: string; reason?: string | null; startsAt: string; endsAt: string; patient: { id: string; fullName: string; birthDate?: string | null; sex?: string | null }; consultation?: Consultation | null; documents: Array<{ id: string; originalName: string; category: string; sizeBytes: number }> };
type Version = { version: number; contentSha256: string; signedAt: string; snapshot: { assessment?: string | null } };

export function DoctorConsultationClient({ appointmentId }: { appointmentId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ complaints: "", anamnesis: "", assessment: "", recommendations: "" });

  async function load() {
    const loaded = await browserApi<Data>(`/doctor/appointments/${appointmentId}`);
    setData(loaded);
    setDraft({ complaints: loaded.consultation?.complaints || "", anamnesis: loaded.consultation?.anamnesis || "", assessment: loaded.consultation?.assessment || "", recommendations: loaded.consultation?.recommendations || "" });
    const history = await browserApi<Version[]>(`/doctor/appointments/${appointmentId}/consultation/versions`).catch(() => []);
    setVersions(history);
  }

  useEffect(() => { void load().catch(() => setMessage("Не удалось открыть приём.")); }, [appointmentId]);

  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Операция не выполнена");
    } finally {
      setBusy(false);
    }
  }

  const save = () => action(() => browserApi(`/doctor/appointments/${appointmentId}/consultation`, { method: "PUT", body: JSON.stringify(draft) }), "Черновик сохранён.");
  const sign = () => action(() => browserApi(`/doctor/appointments/${appointmentId}/consultation/sign`, { method: "POST", body: "{}" }), "Заключение подписано и зафиксировано.");
  const start = () => action(() => browserApi(`/doctor/appointments/${appointmentId}/start`, { method: "POST", body: "{}" }), "Консультация начата.");
  const amend = () => action(() => browserApi(`/doctor/appointments/${appointmentId}/consultation/amend`, { method: "POST", body: "{}" }), "Создана новая версия для дополнения.");
  const complete = () => action(async () => {
    await browserApi(`/doctor/appointments/${appointmentId}/complete`, { method: "POST", body: "{}" });
    await browserApi(`/video/doctor/appointments/${appointmentId}/close`, { method: "POST", body: "{}" }).catch(() => undefined);
  }, "Консультация завершена.");

  async function openDoc(id: string) {
    const result = await browserApi<{ url: string }>(`/documents/${id}/download-url`);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  if (!data) return <main className="doctor-content"><div className={message ? "notice error" : "card"}>{message || "Загрузка приёма…"}</div></main>;

  const locked = Boolean(data.consultation?.signedAt);

  return (
    <main className="doctor-content consultation-page doctor-consultation-v2">
      <Link className="back-link-modern doctor-back-link" href="/doctor"><ArrowLeftIcon /> Сегодня</Link>

      <div className="doctor-consultation-head">
        <div><span className="eyebrow">Консультация</span><h1>{data.patient.fullName}</h1><p>{formatDateTime(data.startsAt)} · <span className={`status status-${data.status}`}>{statusLabel(data.status)}</span></p></div>
        <div className="consult-actions">{["confirmed", "patient_checked_in"].includes(data.status) && <button disabled={busy} onClick={start} className="btn primary">Начать приём</button>}{data.status === "in_progress" && <button disabled={busy} onClick={complete} className="btn primary">Завершить</button>}</div>
      </div>

      {message && <div className="notice">{message}</div>}
      {["confirmed", "patient_checked_in", "in_progress"].includes(data.status) && <VideoCallPanel appointmentId={appointmentId} startsAt={data.startsAt} joinPath={`/video/doctor/appointments/${appointmentId}/join`} title="Видеоконсультация с пациентом" />}

      <div className="consult-grid consult-grid-v2">
        <section className="stack">
          <article className="doctor-patient-summary-v2"><div className="doctor-card-title"><UserIcon /><div><span className="eyebrow">Пациент</span><h2>{data.patient.fullName}</h2></div></div><div className="doctor-summary-meta"><span>Дата рождения: <b>{formatDate(data.patient.birthDate)}</b></span><span>Пол: <b>{data.patient.sex || "не указан"}</b></span></div><div className="reason-box"><b>Причина обращения</b><p>{data.reason || "Не указана"}</p></div><Link className="btn small" href={`/doctor/patients/${data.patient.id}`}>Открыть карточку</Link></article>

          <article className="doctor-clinical-card">
            <div className="between row wrap"><div><span className="eyebrow">Медицинское заключение</span><h2>Версия {data.consultation?.version || 1}</h2></div>{locked && <span className="signed-badge">✓ Подписано</span>}</div>
            <div className="clinical-fields"><label>Жалобы<textarea disabled={locked} className="field textarea" value={draft.complaints} onChange={(event) => setDraft({ ...draft, complaints: event.target.value })} /></label><label>Анамнез<textarea disabled={locked} className="field textarea" value={draft.anamnesis} onChange={(event) => setDraft({ ...draft, anamnesis: event.target.value })} /></label><label>Оценка / заключение<textarea disabled={locked} className="field textarea" value={draft.assessment} onChange={(event) => setDraft({ ...draft, assessment: event.target.value })} /></label><label>Рекомендации<textarea disabled={locked} className="field textarea" value={draft.recommendations} onChange={(event) => setDraft({ ...draft, recommendations: event.target.value })} /></label></div>
            <div className="row wrap">{!locked && <><button disabled={busy} className="btn" onClick={save}>Сохранить черновик</button><button disabled={busy} className="btn primary" onClick={sign}>Подписать версию</button></>}{locked && <button disabled={busy} className="btn" onClick={amend}>Создать дополнение</button>}</div>
          </article>
        </section>

        <aside className="stack consult-aside-v2">
          <article className="card"><div className="doctor-card-title"><DocumentTextIcon /><div><span className="eyebrow">Файлы</span><h3>Документы пациента</h3></div></div><div className="stack compact">{data.documents.map((document) => <button className="document-link" key={document.id} onClick={() => openDoc(document.id)}><DocumentTextIcon /><div><b>{document.originalName}</b><small>{document.category}</small></div></button>)}{data.documents.length === 0 && <p className="muted">Доступных документов нет.</p>}</div></article>
          <article className="card"><span className="eyebrow">История</span><h3>Подписанные версии</h3><div className="version-list">{versions.map((version) => <details key={version.version}><summary>Версия {version.version} · {formatDateTime(version.signedAt)}</summary><p><b>SHA-256</b><br /><code>{version.contentSha256}</code></p><p>{version.snapshot.assessment || "Без текста заключения"}</p></details>)}{versions.length === 0 && <p className="muted">Пока нет подписанных версий.</p>}</div></article>
        </aside>
      </div>
    </main>
  );
}
