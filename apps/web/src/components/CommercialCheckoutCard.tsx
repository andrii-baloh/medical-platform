"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckBadgeIcon, CreditCardIcon, DocumentTextIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { patientRequest } from "@/components/patientRequest";

type Checkout = {
  appointmentId: string;
  configured: boolean;
  readyForPayment: boolean;
  reason: string | null;
  organization?: {
    id: string;
    legalName: string;
    shortName: string;
    address: string;
    license: { number: string; date: string; authority: string };
  };
  service?: {
    catalogId: string;
    code: string;
    name: string;
    description: string | null;
    offerId: string;
    title: string;
    offerDescription: string | null;
  };
  doctor?: { id: string; slug: string; fullName: string; specialty: string };
  price?: { amountMinor: number; currency: string };
  terms?: { conditions: string; refundPolicy: string; serviceProcedure: string };
  contract?: {
    templateId: string;
    displayName: string;
    versionId: string;
    versionNo: number;
    locale: string;
    contentText: string;
    contentSha256: string;
    publishedAt: string | null;
  } | null;
  patientContract?: { id: string; status: string; acceptedAt: string | null } | null;
};

type Payment = {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  checkoutUrl: string | null;
};

const missingReason: Record<string, string> = {
  service_offer_missing: "Для этой записи ещё не настроено коммерческое предложение. Оплата заблокирована до настройки услуги и договора.",
  contract_version_missing: "Для услуги ещё не опубликована версия договора. Оплата заблокирована.",
  commercial_offer_inactive: "Коммерческое предложение сейчас недоступно. Оплата заблокирована.",
};

export function CommercialCheckoutCard({ appointmentId }: { appointmentId: string }) {
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setMessage("");
    try {
      const [commercial, loadedPayments] = await Promise.all([
        patientRequest<Checkout>(`/commercial-services/appointments/${appointmentId}/checkout`),
        patientRequest<Payment[]>(`/payments/appointments/${appointmentId}`),
      ]);
      if (request !== generation.current) return;
      setCheckout(commercial);
      setPayments(loadedPayments);
    } catch {
      if (request === generation.current) setMessage("Не удалось загрузить условия платной медицинской услуги.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, [load]);

  async function acceptContract() {
    if (!checkout?.contract || !accepted || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await patientRequest<Checkout>(`/commercial-services/appointments/${appointmentId}/contracts/accept`, {
        method: "POST",
        body: JSON.stringify({
          contractVersionId: checkout.contract.versionId,
          accepted: true,
          authenticationMethod: "authenticated_click",
        }),
      });
      setCheckout(updated);
      setAccepted(false);
      setMessage("Договор принят. Теперь доступна оплата.");
    } catch {
      setMessage("Не удалось зафиксировать принятие договора. Обновите условия и попробуйте снова.");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!checkout?.readyForPayment || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await patientRequest<Payment>(`/payments/appointments/${appointmentId}/session`, { method: "POST", body: "{}" });
      setPayments((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      if (created.checkoutUrl) window.location.assign(created.checkoutUrl);
    } catch {
      setMessage("Платёжную сессию открыть не удалось. Проверьте статус договора и повторите попытку.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="card commercial-checkout" role="status">Загрузка условий услуги…</section>;
  if (!checkout) return <section className="notice error commercial-checkout">{message || "Условия услуги недоступны."} <button className="btn small" onClick={() => void load()}>Повторить</button></section>;

  const activePayment = payments.find((item) => ["created", "authorized", "paid", "partially_refunded"].includes(item.status)) ?? payments[0] ?? null;
  const paid = activePayment?.status === "paid";

  if (!checkout.configured || !checkout.organization || !checkout.service || !checkout.doctor || !checkout.price || !checkout.terms || !checkout.contract) {
    return (
      <section className="card commercial-checkout commercial-unavailable">
        <div className="commercial-title"><ShieldCheckIcon /><div><span className="eyebrow">Платная медицинская услуга</span><h2>Оплата пока недоступна</h2></div></div>
        <p>{missingReason[checkout.reason ?? ""] || "Юридические условия услуги настроены не полностью."}</p>
      </section>
    );
  }

  const price = new Intl.NumberFormat("ru-RU", { style: "currency", currency: checkout.price.currency }).format(checkout.price.amountMinor / 100);

  return (
    <section className="card commercial-checkout">
      <div className="commercial-title">
        <CreditCardIcon />
        <div><span className="eyebrow">До оплаты</span><h2>Условия платной медицинской услуги</h2><p>Проверьте организацию, лицензию, услугу, врача, цену и договор.</p></div>
        {checkout.patientContract?.status === "accepted" && <span className="signed-badge"><CheckBadgeIcon /> Договор принят</span>}
      </div>

      <div className="commercial-facts">
        <div><small>Медицинская организация</small><b>{checkout.organization.legalName}</b><span>{checkout.organization.address}</span></div>
        <div><small>Лицензия</small><b>№ {checkout.organization.license.number}</b><span>{checkout.organization.license.date} · {checkout.organization.license.authority}</span></div>
        <div><small>Услуга</small><b>{checkout.service.title}</b><span>{checkout.service.name}</span></div>
        <div><small>Врач</small><b>{checkout.doctor.fullName}</b><span>{checkout.doctor.specialty}</span></div>
        <div><small>Цена</small><b>{price}</b><span>Цена зафиксирована в записи и договоре</span></div>
      </div>

      <div className="commercial-terms">
        <article><h3>Условия</h3><p>{checkout.terms.conditions}</p></article>
        <article><h3>Возврат</h3><p>{checkout.terms.refundPolicy}</p></article>
        <article><h3>Порядок оказания услуги</h3><p>{checkout.terms.serviceProcedure}</p></article>
      </div>

      <details className="commercial-contract-text" open={!checkout.readyForPayment}>
        <summary><DocumentTextIcon /> {checkout.contract.displayName} · версия {checkout.contract.versionNo}</summary>
        <pre>{checkout.contract.contentText}</pre>
        <small>SHA-256: {checkout.contract.contentSha256}</small>
      </details>

      {!checkout.readyForPayment && <div className="commercial-acceptance">
        <label><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} /><span>Я ознакомился(ась) с условиями платной медицинской услуги и принимаю указанную версию договора.</span></label>
        <button type="button" className="btn primary" disabled={!accepted || busy} onClick={() => void acceptContract()}>{busy ? "Фиксируем…" : "Принять договор"}</button>
      </div>}

      {checkout.readyForPayment && <div className="commercial-payment-row">
        <div><small>Оплата</small><b>{paid ? "Оплачено" : activePayment ? `Статус: ${activePayment.status}` : "Готово к оплате"}</b>{activePayment?.provider === "development" && <span>Тестовый платёжный провайдер: реального списания нет.</span>}</div>
        {paid ? <span className="signed-badge"><CheckBadgeIcon /> Оплачено</span> : activePayment?.checkoutUrl ? <a className="btn primary" href={activePayment.checkoutUrl}>Перейти к оплате</a> : <button type="button" className="btn primary" disabled={busy} onClick={() => void pay()}>{busy ? "Подготовка…" : "Перейти к оплате"}</button>}
      </div>}

      {message && <div className={checkout.readyForPayment ? "notice success" : "notice"} role="status">{message}</div>}
    </section>
  );
}
