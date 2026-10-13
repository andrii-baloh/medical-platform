"use client";

import { useEffect, useState } from "react";
import { ArrowRightOnRectangleIcon, ChatBubbleLeftRightIcon, ClockIcon, EnvelopeIcon, UserGroupIcon, UserIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Me = {
  email?: string;
  fullName?: string;
  locale: string;
  timezone: string;
  countryCode?: string;
  roles: string[];
  patientProfiles: { id: string; fullName: string; relationToOwner: string }[];
};
type FavoriteDoctor = { id: string; slug: string; fullName: string; specialty: string; rating: number; reviewCount: number; initials?: string | null };
type ApiError = Error & { status?: number };

export function ProfileClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [favorites, setFavorites] = useState<FavoriteDoctor[]>([]);
  const [needLogin, setNeedLogin] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      browserApi<Me>("/me"),
      browserApi<FavoriteDoctor[]>("/engagement/favorites").catch(() => []),
    ]).then(([profile, favoriteDoctors]) => {
      setMe(profile);
      setFavorites(favoriteDoctors);
    }).catch((error: ApiError) => {
      if (error.status === 401) setNeedLogin(true);
      else setMessage("Не удалось загрузить профиль.");
    });
  }, []);

  if (needLogin) return <div className="card booking-login"><h2>Войдите в аккаунт</h2><p>Профиль доступен только после авторизации.</p><a className="btn primary" href="/login">Войти</a></div>;
  if (message) return <div className="notice error">{message}</div>;
  if (!me) return <div className="card">Загрузка профиля…</div>;

  return (
    <div className="profile-public-grid">
      <section className="card profile-main-card">
        <div className="profile-person">
          <div className="profile-avatar"><UserIcon /></div>
          <div><span className="eyebrow">Аккаунт пациента</span><h2>{me.fullName || me.email || "Пользователь"}</h2><p><EnvelopeIcon /> {me.email || "Email не указан"}</p></div>
        </div>
        <div className="profile-role-row">{me.roles.map((role) => <span className="chip" key={role}>{role}</span>)}</div>
        <div className="profile-info-list">
          <div><ClockIcon /><span><small>Часовой пояс</small><b>{me.timezone}</b></span></div>
          <div><UserGroupIcon /><span><small>Профилей пациентов</small><b>{me.patientProfiles.length}</b></span></div>
        </div>
      </section>

      <section className="card family-card">
        <div className="section-head"><div><span className="eyebrow">Семья</span><h2>Профили пациентов</h2></div></div>
        <div className="family-list">
          {me.patientProfiles.map((profile) => <div className="family-row" key={profile.id}><div className="family-avatar">{profile.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><b>{profile.fullName}</b><span>{profile.relationToOwner === "self" ? "Основной профиль" : profile.relationToOwner}</span></div></div>)}
        </div>
      </section>

      <section className="card profile-favorites-card">
        <div className="section-head"><div><span className="eyebrow">Избранное</span><h2>Любимые специалисты</h2></div></div>
        <div className="profile-favorites-list">
          {favorites.map((doctor) => <a className="profile-favorite-doctor" href={`/doctors/${doctor.slug}`} key={doctor.id}><div className="family-avatar">{doctor.initials || doctor.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="grow"><b>{doctor.fullName}</b><span>{doctor.specialty} · {doctor.rating.toFixed(2)} / 5</span></div></a>)}
          {!favorites.length && <p className="muted">Добавляйте врачей в избранное из карточки специалиста.</p>}
        </div>
      </section>

      <section className="profile-actions-card card">
        {me.roles.includes("doctor") && <a className="btn primary" href="/doctor">Открыть кабинет специалиста</a>}
        <a className="btn" href="/support"><ChatBubbleLeftRightIcon /> Поддержка</a>
        <a className="btn danger" href="/api/auth/signout"><ArrowRightOnRectangleIcon /> Выйти из аккаунта</a>
      </section>
    </div>
  );
}
