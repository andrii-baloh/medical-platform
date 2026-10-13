"use client";

import { useEffect, useState } from "react";
import { ArrowRightOnRectangleIcon, ChatBubbleLeftRightIcon, ClockIcon, EnvelopeIcon, UserIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";
import { PatientProfiles } from "@/components/PatientProfiles";

type Me = {
  email?: string;
  fullName?: string;
  locale: string;
  timezone: string;
  countryCode?: string;
  roles: string[];
};
type FavoriteDoctor = { id: string; slug: string; fullName: string; specialty: string; rating: number; reviewCount: number; initials?: string | null };
type PatientProfile = { relationToOwner: string; birthDate?: string | null; phone?: string | null };
type ApiError = Error & { status?: number };

export function ProfileClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [favorites, setFavorites] = useState<FavoriteDoctor[]>([]);
  const [needLogin, setNeedLogin] = useState(false);
  const [message, setMessage] = useState("");
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState("");
  const [favoritesAttempt, setFavoritesAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setMessage("");
    browserApi<Me>("/me").then((profile) => {
      if (active) setMe(profile);
    }).catch((error: ApiError) => {
      if (!active) return;
      if (error.status === 401) { setNeedLogin(true); window.location.assign("/login"); }
      else setMessage("Не удалось загрузить профиль.");
    });
    return () => { active = false; };
  }, [profileAttempt]);

  useEffect(() => {
    if (!me || me.roles.includes("doctor") || me.roles.includes("admin")) return;
    let active = true;
    browserApi<PatientProfile[]>("/patient-profiles").then((profiles) => {
      if (!active) return;
      const self = profiles.find((profile) => profile.relationToOwner === "self");
      if (!self || (self.birthDate && self.phone)) return;
      window.location.assign("/profile/complete");
    }).catch(() => {});
    return () => { active = false; };
  }, [me]);

  useEffect(() => {
    let active = true;
    setFavoritesLoading(true);
    setFavoritesError("");
    browserApi<FavoriteDoctor[]>("/engagement/favorites").then((items) => {
      if (active) setFavorites(items);
    }).catch((error: ApiError) => {
      if (!active) return;
      if (error.status === 401) {
        setNeedLogin(true);
        window.location.assign("/login");
      } else setFavoritesError("Не удалось загрузить избранное. Попробуйте ещё раз.");
    }).finally(() => { if (active) setFavoritesLoading(false); });
    return () => { active = false; };
  }, [favoritesAttempt]);

  if (needLogin) return <div className="card booking-login"><h2>Войдите в аккаунт</h2><p>Профиль доступен только после авторизации.</p><a className="btn primary" href="/login">Войти</a></div>;
  if (message) return <div><p className="notice error" role="alert">{message}</p><button className="btn" type="button" onClick={() => setProfileAttempt((value) => value + 1)}>Повторить загрузку</button></div>;
  if (!me) return <div className="card" role="status">Загрузка профиля…</div>;

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
        </div>
      </section>

      <PatientProfiles />

      <section className="card profile-favorites-card">
        <div className="section-head"><div><span className="eyebrow">Избранное</span><h2>Любимые специалисты</h2></div></div>
        {favoritesLoading ? <p role="status">Загрузка избранного…</p> : favoritesError ? <div><p className="notice error" role="alert">{favoritesError}</p><button className="btn" type="button" onClick={() => setFavoritesAttempt((value) => value + 1)}>Повторить загрузку</button></div> : <div className="profile-favorites-list">
          {favorites.map((doctor) => <a className="profile-favorite-doctor" href={`/doctors/${doctor.slug}`} key={doctor.id}><div className="family-avatar">{doctor.initials || doctor.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="grow"><b>{doctor.fullName}</b><span>{doctor.specialty} · {doctor.rating.toFixed(2)} / 5</span></div></a>)}
          {!favorites.length && <p className="muted">Добавляйте врачей в избранное из карточки специалиста.</p>}
        </div>}
      </section>

      <section className="profile-actions-card card">
        {me.roles.includes("doctor") && <a className="btn primary" href="/doctor">Открыть кабинет специалиста</a>}
        <a className="btn" href="/support"><ChatBubbleLeftRightIcon /> Поддержка</a>
        <a className="btn danger" href="/api/auth/signout"><ArrowRightOnRectangleIcon /> Выйти из аккаунта</a>
      </section>
    </div>
  );
}
