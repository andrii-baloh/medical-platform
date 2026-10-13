"use client";

import { useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { staffRequest, StaffLoadState, useStaffResource } from "@/components/StaffRequest";

type RemdCandidate = {
  documentVersionId: string;
  documentId: string;
  patientProfileId: string;
  versionNo: number;
  category: string;
  sha256Hex: string;
  doctorId: string;
  organizationId: string;
  createdAt: string;
};

type RemdRegistration = {
  id: string;
  documentVersionId: string;
  documentId: string;
  patientProfileId: string;
  versionNo: number;
  category: string;
  status: "queued" | "submitted" | "registered" | "failed";
  externalId: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  integrationJobId: string | null;
  jobStatus: string | null;
  submittedAt: string | null;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RemdReadiness = {
  documentVersionId: string;
  ready: boolean;
  blockers: string[];
  checks: Record<string, boolean>;
};

const blockerLabels: Record<string, string> = {
  immutableHash: "нет неизменяемого SHA-256",
  documentActive: "документ не активен",
  scanClean: "нет чистого результата антивирусной проверки",
  qualifiedSignature: "нет действующей квалифицированной подписи врача",
  doctorRegulatoryVerified: "регуляторный профиль врача не подтверждён",
  activeMedicalOrganization: "нет активной медицинской организации врача",
};

const statusLabels: Record<RemdRegistration["status"], string> = {
  queued: "В очереди",
  submitted: "Передаётся",
  registered: "Зарегистрирован",
  failed: "Ошибка",
};

function shortId(value: string | null) {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function AdminRemdClient() {
  const registrations = useStaffResource<RemdRegistration[]>("/integrations/egisz/remd/registrations?limit=100");
  const candidates = useStaffResource<RemdCandidate[]>("/integrations/egisz/remd/candidates?limit=50");
  const [versionId, setVersionId] = useState("");
  const [query, setQuery] = useState("");
  const [busyVersion, setBusyVersion] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = registrations.data ?? [];
    if (!q) return items;
    return items.filter((item) =>
      `${item.documentVersionId} ${item.integrationJobId ?? ""} ${item.externalId ?? ""} ${item.status} ${item.category}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, registrations.data]);

  async function reloadAll() {
    await Promise.all([registrations.reload(), candidates.reload()]);
  }

  async function queue(targetVersionId: string) {
    const id = targetVersionId.trim();
    if (!id || busyVersion) return;
    setBusyVersion(id);
    setMessage("");
    setError("");
    try {
      const readiness = await staffRequest<RemdReadiness>(`/integrations/egisz/remd/registrations/${encodeURIComponent(id)}/readiness`);
      if (!readiness.ready) {
        const reasons = readiness.blockers.map((blocker) => blockerLabels[blocker] ?? blocker).join("; ");
        setError(`Версия пока не готова к РЭМД: ${reasons}.`);
        return;
      }
      await staffRequest(`/integrations/egisz/remd/registrations/${encodeURIComponent(id)}`, { method: "POST", body: "{}" });
      setVersionId("");
      setMessage("Регистрация поставлена в безопасную очередь интеграции.");
      await reloadAll();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusyVersion(null);
    }
  }

  async function refreshStatus(item: RemdRegistration) {
    if (busyVersion) return;
    setBusyVersion(item.documentVersionId);
    setMessage("");
    setError("");
    try {
      await staffRequest(`/integrations/egisz/remd/registrations/${encodeURIComponent(item.documentVersionId)}/refresh`, { method: "POST", body: "{}" });
      setMessage("Проверка статуса РЭМД поставлена в очередь.");
      await reloadAll();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusyVersion(null);
    }
  }

  async function retry(item: RemdRegistration) {
    if (busyVersion) return;
    setBusyVersion(item.documentVersionId);
    setMessage("");
    setError("");
    try {
      await staffRequest(`/integrations/egisz/remd/registrations/${encodeURIComponent(item.documentVersionId)}/retry`, { method: "POST", body: "{}" });
      setMessage("Повторная попытка поставлена в очередь.");
      await reloadAll();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusyVersion(null);
    }
  }

  return (
    <main className="admin-content">
      <div className="admin-heading">
        <span className="eyebrow">ЕГИСЗ · РЭМД</span>
        <h1>Регистрация медицинских документов</h1>
        <p>Контроль готовности неизменяемых версий и очереди РЭМД. Эта зона не имитирует успешную отправку: фактический обмен начнётся только после подключения реального провайдер-адаптера и тестового контура ЕГИСЗ.</p>
      </div>

      <section className="card remd-queue-card">
        <div className="remd-card-title"><CloudArrowUpIcon /><div><span className="eyebrow">Новая регистрация</span><h2>Проверить версию и поставить в очередь</h2></div></div>
        <div className="remd-version-form">
          <input className="field" aria-label="UUID версии медицинского документа" value={versionId} onChange={(event) => setVersionId(event.target.value)} placeholder="UUID medical_document_version" />
          <button type="button" className="btn primary" disabled={!versionId.trim() || Boolean(busyVersion)} onClick={() => void queue(versionId)}>{busyVersion === versionId.trim() ? "Проверка…" : "Проверить и поставить"}</button>
        </div>
        {message && <div className="notice success" role="status">{message}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
      </section>

      <section className="remd-section">
        <div className="section-row"><div><span className="eyebrow">Готовые версии</span><h2>Кандидаты без активной регистрации</h2></div><button type="button" className="btn small" onClick={() => void candidates.reload()}><ArrowPathIcon /> Обновить</button></div>
        <StaffLoadState loading={candidates.loading} error={candidates.error} retry={candidates.reload} />
        {!candidates.loading && !candidates.error && <div className="remd-candidate-grid">
          {(candidates.data ?? []).map((item) => <article className="card remd-candidate" key={item.documentVersionId}>
            <div className="remd-candidate-head"><CheckCircleIcon /><div><b>Версия {item.versionNo}</b><small>{item.category}</small></div></div>
            <dl><div><dt>Версия</dt><dd><code title={item.documentVersionId}>{shortId(item.documentVersionId)}</code></dd></div><div><dt>Врач</dt><dd><code title={item.doctorId}>{shortId(item.doctorId)}</code></dd></div><div><dt>Организация</dt><dd><code title={item.organizationId}>{shortId(item.organizationId)}</code></dd></div></dl>
            <button type="button" className="btn" disabled={Boolean(busyVersion)} onClick={() => void queue(item.documentVersionId)}>Поставить в очередь</button>
          </article>)}
          {!(candidates.data ?? []).length && <div className="empty card">Нет версий, прошедших все проверки готовности.</div>}
        </div>}
      </section>

      <section className="remd-section">
        <div className="section-row"><div><span className="eyebrow">Журнал</span><h2>Регистрации РЭМД</h2></div></div>
        <label className="admin-search"><MagnifyingGlassIcon /><input aria-label="Поиск регистраций РЭМД" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Версия, job ID, внешний ID, статус" /></label>
        <StaffLoadState loading={registrations.loading} error={registrations.error} retry={registrations.reload} />
        <div className="admin-table-card">
          <div className="admin-table admin-remd-table">
            <div className="admin-table-head"><span>Документ</span><span>Статус РЭМД</span><span>Integration job</span><span>Действие</span></div>
            {shown.map((item) => <div className="admin-table-row" key={item.id}>
              <div><b>Версия {item.versionNo} · {item.category}</b><small title={item.documentVersionId}>{shortId(item.documentVersionId)}</small></div>
              <div><span className={`payment-state remd-${item.status}`}>{statusLabels[item.status]}</span><small>{item.externalId ? `ID: ${item.externalId}` : `Попыток: ${item.attemptCount}`}</small></div>
              <div><b>{item.jobStatus || "—"}</b><small title={item.integrationJobId ?? undefined}>{shortId(item.integrationJobId)}</small></div>
              <div>{item.status === "failed" ? <button type="button" className="admin-state-btn" disabled={Boolean(busyVersion)} onClick={() => void retry(item)}><ArrowPathIcon /> Повторить</button> : item.status === "submitted" && item.jobStatus === "succeeded" ? <button type="button" className="admin-state-btn" disabled={Boolean(busyVersion)} onClick={() => void refreshStatus(item)}><ArrowPathIcon /> Проверить статус</button> : <small>{item.registeredAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.registeredAt)) : item.lastErrorCode || "Ожидает обработки"}</small>}</div>
            </div>)}
          </div>
          {!registrations.loading && !registrations.error && !shown.length && <div className="empty">Регистрации не найдены.</div>}
        </div>
      </section>

      <div className="remd-safety-note"><ExclamationTriangleIcon /><span><b>Без клинического текста в админке</b><small>Здесь отображаются только технические идентификаторы, readiness-проверки и статусы регистрации. Содержимое медицинского документа не выводится.</small></span></div>
    </main>
  );
}
