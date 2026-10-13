"use client";

import { FormEvent, useRef, useEffect, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { staffRequest as browserApi, StaffLoadState } from "@/components/StaffRequest";

type AuditItem = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

export function AdminAuditClient() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const request = useRef(0);
  const lastQuery = useRef("");

  async function load(q = "") {
    const current = ++request.current;
    lastQuery.current = q;
    setMessage("");
    setItems([]);
    setBusy(true);
    try {
      const suffix = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const loaded = await browserApi<AuditItem[]>(`/admin/audit${suffix}`);
      if (current !== request.current) return;
      setItems(loaded);
      setMessage("");
    } catch (error) {
      if (current !== request.current) return;
      setMessage((error as Error & { status?: number }).status === 403 ? "Нет доступа администратора." : "Не удалось загрузить журнал аудита.");
    } finally {
      if (current === request.current) setBusy(false);
    }
  }

  useEffect(() => { void load(); return () => { request.current++; }; }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(query);
  }

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Безопасность</span><h1>Audit trail</h1><p>Системные действия и контроль доступа. Медицинский свободный текст в журнал не записывается.</p></div>
      <form className="admin-search admin-search-form" onSubmit={submit}><MagnifyingGlassIcon /><input aria-label="Поиск по списку" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Действие, тип ресурса или ID" /><button disabled={busy} className="btn small">Найти</button></form>
      <StaffLoadState loading={busy} error={message} retry={() => void load(lastQuery.current)} />
      <div className="admin-table-card">
        <div className="admin-table admin-audit-table">
          <div className="admin-table-head"><span>Время</span><span>Действие</span><span>Ресурс</span><span>Результат</span></div>
          {items.map((item) => <div className="admin-table-row" key={item.id}>
            <div><b>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.occurredAt))}</b><small>{item.requestId || item.id}</small></div>
            <div><code>{item.action}</code><small>{item.actorUserId || "system"}</small></div>
            <div><b>{item.resourceType}</b><small>{item.resourceId || "—"}</small></div>
            <div><span className={`audit-outcome audit-${item.outcome}`}>{item.outcome}</span></div>
          </div>)}
        </div>
        {!busy && !items.length && !message && <div className="empty">События не найдены.</div>}
      </div>
    </main>
  );
}
