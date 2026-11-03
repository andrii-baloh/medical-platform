"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useStaffResource, StaffLoadState } from "@/components/StaffRequest";

type Payment = {
  id: string;
  appointmentId: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  doctorName: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

type FiscalReceipt = {
  id: string;
  appointmentId: string;
  provider: string;
  receiptType: string;
  status: string;
  amountMinor: number;
  currency: string;
  attempts: number;
  lastErrorCode: string | null;
  patientName: string | null;
  doctorName: string | null;
  createdAt: string;
  fiscal: {
    fnNumber: string | null;
    documentNumber: string | null;
    documentAttribute: string | null;
    registeredAt: string | null;
  } | null;
};

const receiptStatusLabel: Record<string, string> = {
  pending: "в очереди",
  processing: "регистрация",
  submitted: "отправлен в ККТ",
  confirmed: "зарегистрирован",
  failed: "ошибка",
  not_provided: "чек не сформирован",
};

function money(item: { amountMinor: number; currency: string }) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: item.currency }).format(item.amountMinor / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AdminPaymentsClient() {
  const { data: loaded, loading, error, reload } = useStaffResource<Payment[]>("/admin/payments");
  const { data: loadedReceipts, loading: receiptsLoading, error: receiptsError, reload: reloadReceipts } = useStaffResource<FiscalReceipt[]>("/admin/payment-receipts");
  const items = loaded ?? [];
  const receipts = loadedReceipts ?? [];
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.doctorName} ${item.patientName} ${item.status} ${item.provider} ${item.id}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Финансы</span><h1>Платежи</h1><p>Статусы платежей и техническая сверка. Карточные данные платформа не хранит.</p></div>
      <label className="admin-search"><MagnifyingGlassIcon /><input aria-label="Поиск по списку" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пациент, врач, статус, провайдер или ID" /></label>
      <StaffLoadState loading={loading} error={error} retry={reload} />
      <div className="admin-table-card">
        <div className="admin-table admin-payments-table">
          <div className="admin-table-head"><span>Платёж</span><span>Участники</span><span>Статус</span><span>Сумма</span></div>
          {shown.map((item) => <div className="admin-table-row" key={item.id}>
            <div><b>{item.provider}</b><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>
            <div><b>{item.patientName}</b><small>{item.doctorName}</small></div>
            <div><span className={`payment-state payment-${item.status}`}>{item.status}</span></div>
            <div><b>{money(item)}</b><small>{item.paidAt ? `Оплачено ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.paidAt))}` : item.appointmentId}</small></div>
          </div>)}
        </div>
        {!loading && !error && !shown.length && <div className="empty">Платежи не найдены.</div>}
      </div>

      <div className="admin-heading"><span className="eyebrow">Онлайн-касса</span><h2>Чеки ККТ (54-ФЗ)</h2><p>Итоговый чек формируется после завершения консультации. Фискальные признаки приходят от оператора ККТ, платформа их не рассчитывает.</p></div>
      <StaffLoadState loading={receiptsLoading} error={receiptsError} retry={reloadReceipts} />
      <div className="admin-table-card">
        <div className="admin-table admin-payments-table">
          <div className="admin-table-head"><span>Чек</span><span>Участники</span><span>Статус</span><span>Сумма</span></div>
          {receipts.map((item) => <div className="admin-table-row" key={item.id}>
            <div><b>{item.receiptType === "full_payment" ? "итоговый" : "авансовый"}</b><small>{item.provider} · {formatDate(item.createdAt)}</small></div>
            <div><b>{item.patientName ?? "—"}</b><small>{item.doctorName ?? "—"}</small></div>
            <div>
              <span className={`payment-state payment-${item.status}`}>{receiptStatusLabel[item.status] ?? item.status}</span>
              {item.lastErrorCode && <small>{item.lastErrorCode}</small>}
            </div>
            <div>
              <b>{money(item)}</b>
              <small>{item.fiscal?.documentNumber ? `ФН ${item.fiscal.fnNumber ?? "—"} · док. ${item.fiscal.documentNumber}` : `фискальные данные не получены · попыток ${item.attempts}`}</small>
            </div>
          </div>)}
        </div>
        {!receiptsLoading && !receiptsError && !receipts.length && <div className="empty">Чеков пока нет: они появляются после оплаты и завершения консультации.</div>}
      </div>
    </main>
  );
}
