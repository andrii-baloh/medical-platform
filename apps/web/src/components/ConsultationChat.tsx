"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PaperAirplaneIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import { patientRequest } from "@/components/patientRequest";

type Material = {
  id: string;
  authorRole: string;
  type: string;
  body: string | null;
  createdAt: string;
  document: { id: string; originalName: string | null; mimeType: string | null; sizeBytes: number | null } | null;
};

type MaterialsPayload = {
  encounterId: string;
  encounterStatus: string;
  canPost: boolean;
  items: Material[];
};

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

const typeLabel: Record<string, string> = {
  chat: "Сообщение",
  file: "Документ",
  image: "Изображение",
  voice: "Голосовое сообщение",
  video: "Видео",
  recording: "Запись консультации",
  measurement: "Измерение",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function ConsultationChat({
  appointmentId,
  request = patientRequest,
  title = "Чат консультации",
  attachableDocuments = [],
}: {
  appointmentId: string;
  request?: RequestFn;
  title?: string;
  attachableDocuments?: Array<{ id: string; originalName: string }>;
}) {
  const [payload, setPayload] = useState<MaterialsPayload | null>(null);
  const [text, setText] = useState("");
  const [attachId, setAttachId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request<MaterialsPayload>(`/consultation-materials/appointments/${appointmentId}`);
      setPayload(data);
      setMessage("");
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      setPayload(null);
      setMessage(status === 409
        ? "Чат станет доступен после начала приёма: врач ещё не открыл медицинский случай."
        : "Не удалось загрузить материалы консультации.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId, request]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [payload]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await request(`/consultation-materials/appointments/${appointmentId}/chat`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setText("");
      await load();
    } catch {
      setMessage("Сообщение не отправлено. Проверьте, что консультация ещё активна.");
    } finally {
      setBusy(false);
    }
  }

  async function attach() {
    if (!attachId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await request(`/consultation-materials/appointments/${appointmentId}/documents`, {
        method: "POST",
        body: JSON.stringify({ documentId: attachId, materialType: "file" }),
      });
      setAttachId("");
      await load();
    } catch {
      setMessage("Документ не прикреплён: он недоступен или уже привязан к консультации.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card consultation-chat">
      <div className="between row wrap">
        <div><span className="eyebrow">Материалы консультации</span><h3>{title}</h3></div>
        {payload && <small className="muted">{payload.canPost ? "Консультация активна" : "Только чтение"}</small>}
      </div>

      {loading && <div role="status">Загрузка сообщений…</div>}
      {message && <div className="notice" role="status">{message}</div>}

      {payload && (
        <>
          <div className="consultation-chat-list" ref={listRef}>
            {payload.items.length === 0 && <p className="muted">Сообщений пока нет. Напишите первое сообщение или прикрепите документ.</p>}
            {payload.items.map((item) => (
              <article key={item.id} className={`consultation-chat-item from-${item.authorRole}`}>
                <div className="between row wrap">
                  <b>{item.authorRole === "doctor" ? "Врач" : item.authorRole === "patient" ? "Пациент" : "Система"}</b>
                  <small className="muted">{formatTime(item.createdAt)}</small>
                </div>
                {item.type === "chat" && <p>{item.body}</p>}
                {item.document && (
                  <p>
                    <PaperClipIcon /> {typeLabel[item.type] ?? item.type}:{" "}
                    <a href={`/api/backend/documents/${item.document.id}/download-url`} target="_blank" rel="noopener noreferrer">
                      {item.document.originalName ?? "файл"}
                    </a>
                  </p>
                )}
              </article>
            ))}
          </div>

          {payload.canPost ? (
            <>
              {attachableDocuments.length > 0 && (
                <div className="row wrap consultation-chat-attach">
                  <select
                    className="field"
                    aria-label="Документ для прикрепления"
                    value={attachId}
                    onChange={(event) => setAttachId(event.target.value)}
                  >
                    <option value="">Прикрепить документ…</option>
                    {attachableDocuments.map((document) => (
                      <option key={document.id} value={document.id}>{document.originalName}</option>
                    ))}
                  </select>
                  <button className="btn" type="button" disabled={busy || !attachId} onClick={() => void attach()}>Прикрепить</button>
                </div>
              )}
              <div className="consultation-chat-compose">
              <label>
                <span className="visually-hidden">Сообщение</span>
                <textarea
                  className="field textarea"
                  maxLength={4000}
                  rows={2}
                  value={text}
                  placeholder="Напишите сообщение по консультации"
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
              </label>
              <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={() => void send()}>
                <PaperAirplaneIcon /> {busy ? "Отправка…" : "Отправить"}
              </button>
              </div>
            </>
          ) : (
            <div className="notice">Консультация завершена — чат доступен только для чтения.</div>
          )}
        </>
      )}
    </section>
  );
}
