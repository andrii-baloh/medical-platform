"use client";

import { CheckBadgeIcon, ClockIcon, CurrencyDollarIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { useStaffResource, StaffLoadState } from "@/components/StaffRequest";

type Doctor = { doctorId: string; slug: string; fullName: string; initials?: string | null; about?: string | null; verified: boolean; published: boolean; timezone: string; locale: string; price: { amountMinor: number; currency: string } };

export function DoctorProfileClient() {
  const { data: loaded, loading, error, reload } = useStaffResource<Doctor>("/doctor/me");
  const doctor = loaded;

  if (!doctor) return <main className="doctor-content"><StaffLoadState loading={loading} error={error} retry={reload} /></main>;

  const price = new Intl.NumberFormat("ru-RU", { style: "currency", currency: doctor.price.currency }).format(doctor.price.amountMinor / 100);

  return (
    <main className="doctor-content doctor-profile-v2">
      <div className="doctor-heading doctor-heading-v2"><div><span className="eyebrow">Профиль</span><h1>Профиль специалиста</h1><p>Публичная информация и настройки рабочего кабинета.</p></div></div>

      <div className="doctor-profile-grid-v2">
        <section className="doctor-profile-main-card">
          <div className="doctor-profile-person"><div className="avatar xl">{doctor.initials || "MD"}</div><div><h2>{doctor.fullName}</h2><span className={`verified-pill ${doctor.verified ? "ok" : ""}`}><CheckBadgeIcon /> {doctor.verified ? "Профиль подтверждён" : "Ожидает проверки"}</span></div></div>
          <p>{doctor.about || "Описание специалиста пока не заполнено."}</p>
        </section>

        <section className="doctor-settings-grid">
          <article className="doctor-setting-card"><GlobeAltIcon /><span><small>Публичный профиль</small><b>{doctor.published ? "Опубликован" : "Скрыт"}</b></span></article>
          <article className="doctor-setting-card"><ClockIcon /><span><small>Часовой пояс</small><b>{doctor.timezone}</b></span></article>
          <article className="doctor-setting-card"><GlobeAltIcon /><span><small>Язык интерфейса</small><b>{doctor.locale}</b></span></article>
          <article className="doctor-setting-card"><CurrencyDollarIcon /><span><small>Стоимость консультации</small><b>{price}</b></span></article>
        </section>
      </div>
    </main>
  );
}
