"use client";

import { FormEvent, useEffect, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

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
  const [busy, setBusy] = useState(false);

  async function load(q = "") {
    setBusy(true);
    try {
      const suffix = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      setItems(await browserApi<AuditItem[]>(`/admin/audit${suffix}`));
      setMessage("");
    } catch (error) {
      setMessage((error as Error & { status?: number }).status === 403 ? "Нет доступа администратора." : "Не удалось загрузить журнал аудита.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(query);
  }

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Безопасность</span><h1>Audit trail</h1><p>Системные действия и контроль доступа. Медицинский свободный текст в журнал не записывается.</p></div>
      <form className="admin-search admin-search-form" onSubmit={submit}><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Действие, тип ресурса или ID" /><button disabled={busy} className="btn small">Найти</button></form>
      {message && <div className="notice error">{message}</div>}
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
        {!items.length && !message && <div className="empty">События не найдены.</div>}
      </div>
    </main>
  );
}
