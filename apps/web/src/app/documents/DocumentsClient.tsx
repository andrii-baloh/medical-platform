"use client";

import { useEffect, useState } from "react";
import { ArrowUpTrayIcon, DocumentTextIcon, FolderOpenIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Doc = { id: string; patientProfileId: string; originalName: string; mimeType: string; sizeBytes: number; category: string; status: string; createdAt: string };
type Me = { patientProfiles: { id: string; fullName: string }[] };
type UploadIntent = { uploadUrl: string; requiredHeaders: Record<string, string>; document: { id: string } };
type ApiError = Error & { status?: number };

export function DocumentsClient() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [patientId, setPatientId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  async function load() {
    try {
      const [documents, profile] = await Promise.all([browserApi<Doc[]>("/documents"), browserApi<Me>("/me")]);
      setDocs(documents);
      setMe(profile);
      setPatientId((current) => current || profile.patientProfiles[0]?.id || "");
    } catch (error) {
      if ((error as ApiError).status === 401) setNeedLogin(true);
      else setMessage("Не удалось загрузить документы.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function upload(file: File) {
    if (!patientId) return;
    setBusy(true);
    setMessage("");
    try {
      const intent = await browserApi<UploadIntent>("/documents/upload-intents", {
        method: "POST",
        body: JSON.stringify({ patientProfileId: patientId, originalName: file.name, mimeType: file.type, sizeBytes: file.size, category: "other" }),
      });
      const put = await fetch(intent.uploadUrl, { method: "PUT", headers: intent.requiredHeaders, body: file });
      if (!put.ok) throw new Error("upload");
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256Hex = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
      await browserApi(`/documents/${intent.document.id}/complete`, { method: "POST", body: JSON.stringify({ sha256Hex }) });
      setMessage("Документ успешно загружен.");
      await load();
    } catch {
      setMessage("Не удалось загрузить документ.");
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    try {
      const result = await browserApi<{ url: string }>(`/documents/${id}/download-url`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setMessage("Не удалось получить доступ к документу.");
    }
  }

  if (needLogin) return <div className="card booking-login"><h2>Войдите в аккаунт</h2><p>Документы доступны только после авторизации.</p><a className="btn primary" href="/login">Войти</a></div>;

  return (
    <div className="documents-layout">
      <section className="card upload-panel">
        <div className="upload-panel-icon"><ArrowUpTrayIcon /></div>
        <div><span className="eyebrow">Новый файл</span><h2>Загрузить документ</h2><p>PDF, JPEG, PNG или WebP до 25 МБ.</p></div>
        <label className="field-label">Профиль пациента<select className="field" value={patientId} onChange={(event) => setPatientId(event.target.value)}>{me?.patientProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.fullName}</option>)}</select></label>
        <label className="file-drop"><ArrowUpTrayIcon /><span>{busy ? "Загрузка…" : "Выберите файл"}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
        <div className="secure-note"><ShieldCheckIcon /> Файлы хранятся приватно и не публикуются в открытом доступе.</div>
        {message && <div className="notice">{message}</div>}
      </section>

      <section className="documents-list-panel">
        <div className="section-head"><div><span className="eyebrow">Хранилище</span><h2>Мои документы</h2></div><span className="count-pill">{docs.length}</span></div>
        <div className="documents-modern-list">
          {docs.map((doc) => <article className="document-modern-card" key={doc.id}><div className="document-modern-icon"><DocumentTextIcon /></div><div className="grow"><b>{doc.originalName}</b><span>{new Intl.DateTimeFormat("ru-RU").format(new Date(doc.createdAt))} · {(doc.sizeBytes / 1024 / 1024).toFixed(1)} МБ</span></div><span className={`document-status ${doc.status}`}>{doc.status}</span>{doc.status === "active" && <button className="btn small" onClick={() => download(doc.id)}><FolderOpenIcon /> Открыть</button>}</article>)}
          {!docs.length && <div className="card empty-state-modern"><DocumentTextIcon /><h3>Документов пока нет</h3><p>Загрузите результаты обследований или другие медицинские файлы.</p></div>}
        </div>
      </section>
    </div>
  );
}
