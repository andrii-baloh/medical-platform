"use client";

import { FormEvent, useMemo, useState } from "react";
import { BuildingOffice2Icon, DocumentTextIcon, PlusIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { staffRequest, StaffLoadState, useStaffResource } from "@/components/StaffRequest";

type Organization = { id: string; shortName: string; legalName: string; licenseNumber: string; active: boolean };
type Doctor = { id: string; fullName: string; specialty: string; verified: boolean; published: boolean };
type Catalog = { id: string; organizationId: string; organizationName: string; code: string; name: string; description: string | null; active: boolean };
type ContractTemplate = { id: string; organizationId: string; organizationName: string; code: string; displayName: string; active: boolean; currentVersionId: string | null; currentVersionNo: number | null; locale: string | null; publishedAt: string | null };
type Offer = { id: string; title: string; priceMinor: number; currency: string; active: boolean; validFrom: string; validUntil: string | null; serviceName: string; organizationName: string; doctorName: string };
type Overview = { catalogs: Catalog[]; contractTemplates: ContractTemplate[]; offers: Offer[] };

export function AdminCommercialServicesClient() {
  const overview = useStaffResource<Overview>("/commercial-services/admin/overview");
  const organizations = useStaffResource<Organization[]>("/medical-organizations");
  const doctors = useStaffResource<Doctor[]>("/admin/doctors");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [catalogOrg, setCatalogOrg] = useState("");
  const [catalogCode, setCatalogCode] = useState("");
  const [catalogName, setCatalogName] = useState("");

  const [templateOrg, setTemplateOrg] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [versionTemplate, setVersionTemplate] = useState("");
  const [versionNo, setVersionNo] = useState("1");
  const [contractText, setContractText] = useState("");

  const [offerCatalog, setOfferCatalog] = useState("");
  const [offerDoctor, setOfferDoctor] = useState("");
  const [offerTemplate, setOfferTemplate] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [conditions, setConditions] = useState("");
  const [refund, setRefund] = useState("");
  const [procedure, setProcedure] = useState("");

  const activeOrganizations = useMemo(() => (organizations.data ?? []).filter((item) => item.active), [organizations.data]);
  const verifiedDoctors = useMemo(() => (doctors.data ?? []).filter((item) => item.verified), [doctors.data]);
  const templatesWithVersion = useMemo(() => (overview.data?.contractTemplates ?? []).filter((item) => item.currentVersionId), [overview.data]);
  const loading = overview.loading || organizations.loading || doctors.loading;
  const loadError = overview.error || organizations.error || doctors.error;

  async function refresh() {
    await Promise.all([overview.reload(), organizations.reload(), doctors.reload()]);
  }

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function createCatalog(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await staffRequest("/commercial-services/admin/catalogs", { method: "POST", body: JSON.stringify({ organizationId: catalogOrg, code: catalogCode, name: catalogName }) });
      setCatalogCode(""); setCatalogName("");
    }, "Услуга добавлена в каталог.");
  }

  function createTemplate(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await staffRequest("/commercial-services/admin/contract-templates", { method: "POST", body: JSON.stringify({ organizationId: templateOrg, code: templateCode, displayName: templateName }) });
      setTemplateCode(""); setTemplateName("");
    }, "Шаблон договора создан.");
  }

  function publishVersion(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await staffRequest(`/commercial-services/admin/contract-templates/${versionTemplate}/versions`, { method: "POST", body: JSON.stringify({ versionNo: Number(versionNo), locale: "ru", contentText: contractText }) });
      setContractText(""); setVersionNo(String(Number(versionNo) + 1));
    }, "Версия договора опубликована и зафиксирована.");
  }

  function createOffer(event: FormEvent) {
    event.preventDefault();
    const priceMinor = Math.round(Number(offerPrice.replace(",", ".")) * 100);
    void run(async () => {
      await staffRequest("/commercial-services/admin/offers", { method: "POST", body: JSON.stringify({ serviceCatalogId: offerCatalog, doctorId: offerDoctor, contractTemplateId: offerTemplate, title: offerTitle, priceMinor, currency: "RUB", conditionsText: conditions, refundPolicyText: refund, serviceProcedureText: procedure }) });
      setOfferTitle(""); setOfferPrice(""); setConditions(""); setRefund(""); setProcedure("");
    }, "Коммерческое предложение создано.");
  }

  return (
    <main className="admin-content commercial-admin-page">
      <div className="admin-heading"><span className="eyebrow">Платные медицинские услуги</span><h1>Каталог, договоры и предложения</h1><p>Здесь настраивается юридический слой до оплаты: медицинская организация, лицензия, услуга, врач, цена, условия, возврат и порядок оказания услуги.</p></div>
      <StaffLoadState loading={loading} error={loadError} retry={() => void refresh()} />
      {message && <div className={message.startsWith("Не удалось") || message.startsWith("Нет доступа") ? "notice error" : "notice success"} role="status">{message}</div>}

      {!loading && !loadError && <>
        <section className="commercial-admin-grid">
          <form className="card stack" onSubmit={createCatalog}><div className="commercial-admin-title"><Squares2X2Icon /><div><span className="eyebrow">1. Каталог</span><h2>Медицинская услуга</h2></div></div><label className="field-label">Организация<select className="field" required value={catalogOrg} onChange={(e) => setCatalogOrg(e.target.value)}><option value="">Выберите</option>{activeOrganizations.map((org) => <option key={org.id} value={org.id}>{org.shortName} · {org.licenseNumber}</option>)}</select></label><label className="field-label">Код<input className="field" required maxLength={80} value={catalogCode} onChange={(e) => setCatalogCode(e.target.value)} placeholder="telemed_general" /></label><label className="field-label">Название<input className="field" required maxLength={300} value={catalogName} onChange={(e) => setCatalogName(e.target.value)} placeholder="Онлайн-консультация врача" /></label><button className="btn primary" disabled={busy}>Добавить услугу</button></form>

          <form className="card stack" onSubmit={createTemplate}><div className="commercial-admin-title"><DocumentTextIcon /><div><span className="eyebrow">2. Договор</span><h2>Шаблон договора</h2></div></div><label className="field-label">Организация<select className="field" required value={templateOrg} onChange={(e) => setTemplateOrg(e.target.value)}><option value="">Выберите</option>{activeOrganizations.map((org) => <option key={org.id} value={org.id}>{org.shortName}</option>)}</select></label><label className="field-label">Код<input className="field" required value={templateCode} onChange={(e) => setTemplateCode(e.target.value)} placeholder="paid_medical_service" /></label><label className="field-label">Название<input className="field" required value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Договор на оказание платных медицинских услуг" /></label><button className="btn primary" disabled={busy}>Создать шаблон</button></form>

          <form className="card stack commercial-admin-wide" onSubmit={publishVersion}><div className="commercial-admin-title"><DocumentTextIcon /><div><span className="eyebrow">3. Версия</span><h2>Опубликовать точный текст договора</h2></div></div><div className="commercial-admin-two"><label className="field-label">Шаблон<select className="field" required value={versionTemplate} onChange={(e) => setVersionTemplate(e.target.value)}><option value="">Выберите</option>{(overview.data?.contractTemplates ?? []).map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.organizationName}</option>)}</select></label><label className="field-label">Номер версии<input className="field" type="number" min="1" required value={versionNo} onChange={(e) => setVersionNo(e.target.value)} /></label></div><label className="field-label">Текст договора<textarea className="field textarea commercial-contract-editor" required value={contractText} onChange={(e) => setContractText(e.target.value)} placeholder="Вставьте утверждённый юридический текст договора. Система сохранит точную версию и SHA-256." /></label><button className="btn primary" disabled={busy}>Опубликовать версию</button></form>

          <form className="card stack commercial-admin-wide" onSubmit={createOffer}><div className="commercial-admin-title"><BuildingOffice2Icon /><div><span className="eyebrow">4. Предложение</span><h2>Связать услугу, врача, цену и договор</h2></div></div><div className="commercial-admin-two"><label className="field-label">Услуга<select className="field" required value={offerCatalog} onChange={(e) => setOfferCatalog(e.target.value)}><option value="">Выберите</option>{(overview.data?.catalogs ?? []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.organizationName}</option>)}</select></label><label className="field-label">Врач<select className="field" required value={offerDoctor} onChange={(e) => setOfferDoctor(e.target.value)}><option value="">Выберите</option>{verifiedDoctors.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.specialty}</option>)}</select></label><label className="field-label">Договор<select className="field" required value={offerTemplate} onChange={(e) => setOfferTemplate(e.target.value)}><option value="">Выберите опубликованную версию</option>{templatesWithVersion.map((item) => <option key={item.id} value={item.id}>{item.displayName} · версия {item.currentVersionNo}</option>)}</select></label><label className="field-label">Цена, ₽<input className="field" inputMode="decimal" required value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="2500" /></label></div><label className="field-label">Название предложения<input className="field" required value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} placeholder="Онлайн-консультация терапевта" /></label><label className="field-label">Условия<textarea className="field textarea" required value={conditions} onChange={(e) => setConditions(e.target.value)} /></label><label className="field-label">Условия возврата<textarea className="field textarea" required value={refund} onChange={(e) => setRefund(e.target.value)} /></label><label className="field-label">Порядок оказания услуги<textarea className="field textarea" required value={procedure} onChange={(e) => setProcedure(e.target.value)} /></label><button className="btn primary" disabled={busy || !Number.isFinite(Number(offerPrice.replace(",", ".")))}>Создать предложение</button></form>
        </section>

        <section className="commercial-admin-summary"><div className="section-row"><div><span className="eyebrow">Текущее состояние</span><h2>Активные предложения</h2></div></div><div className="admin-table-card"><div className="admin-table commercial-offers-table"><div className="admin-table-head"><span>Услуга</span><span>Организация</span><span>Врач</span><span>Цена</span></div>{(overview.data?.offers ?? []).map((offer) => <div className="admin-table-row" key={offer.id}><div><b>{offer.title}</b><small>{offer.serviceName}</small></div><div><b>{offer.organizationName}</b><small>{offer.active ? "Активно" : "Отключено"}</small></div><div><b>{offer.doctorName}</b></div><div><b>{new Intl.NumberFormat("ru-RU", { style: "currency", currency: offer.currency }).format(offer.priceMinor / 100)}</b></div></div>)}</div>{!(overview.data?.offers ?? []).length && <div className="empty">Предложений пока нет.</div>}</div></section>
      </>}
    </main>
  );
}
