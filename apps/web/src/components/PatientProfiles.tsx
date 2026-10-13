"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { browserApi } from "@/lib/api";

type PatientProfile = {
  id: string;
  fullName: string;
  birthDate?: string | null;
  sex?: string | null;
  relationToOwner: string;
  countryCode?: string | null;
};
type ApiError = Error & { status?: number };
const relations: Record<string, string> = { self: "Основной профиль", child: "Ребёнок", parent: "Родитель", spouse: "Супруг / супруга", sibling: "Брат / сестра", relative: "Родственник", other: "Другое" };
const sexes: Record<string, string> = { unspecified: "Не указан", female: "Женский", male: "Мужской", other: "Другой" };

function errorMessage(error: ApiError) {
  if (error.status === 401) {
    window.location.assign("/login");
    return "Сессия завершена. Войдите в аккаунт.";
  }
  if (error.status === 400) return "Проверьте имя, дату рождения и код страны.";
  if (error.status === 403) return "Нет доступа к этому действию.";
  if (error.status === 404) return "Профиль недоступен. Обновите список.";
  if (error.status === 409) return "Действие недоступно для текущего состояния профиля. Обновите список.";
  return "Не удалось выполнить запрос. Проверьте соединение и обновите список перед повторной попыткой.";
}

export function PatientProfiles() {
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<PatientProfile | "new" | null>(null);
  const [archive, setArchive] = useState<PatientProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const cancelArchive = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    browserApi<PatientProfile[]>("/patient-profiles").then((items) => {
      if (active) setProfiles(items);
    }).catch((err: ApiError) => {
      if (active) setError(errorMessage(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => { if (archive) cancelArchive.current?.focus(); }, [archive]);

  function close() {
    setEditor(null);
    setArchive(null);
    heading.current?.focus();
  }

  async function mutate(path: string, method: string, payload?: Record<string, string>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await browserApi<unknown>(path, { method, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      close();
      setNotice("Изменения сохранены.");
      setAttempt((value) => value + 1);
    } catch (err) {
      setError(errorMessage(err as ApiError));
      // A failed response may follow a successful server write. Require a fresh read.
      close();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function row(profile: PatientProfile) {
    return <li className="patient-profile-row" key={profile.id}>
      <div><b>{profile.fullName}</b><p>{relations[profile.relationToOwner] || "Зависимый профиль"}</p></div>
      <div className="patient-profile-actions">
        <button className="btn" type="button" aria-label={`Редактировать профиль: ${profile.fullName}`} onClick={() => { setEditor(profile); setNotice(""); }}>Редактировать</button>
        {profile.relationToOwner !== "self" && <button className="btn danger" type="button" aria-label={`Архивировать профиль: ${profile.fullName}`} onClick={() => { setArchive(profile); setNotice(""); }}>Архивировать</button>}
      </div>
    </li>;
  }

  const self = profiles.filter((profile) => profile.relationToOwner === "self");
  const dependents = profiles.filter((profile) => profile.relationToOwner !== "self");
  return <section className="card patient-profiles" aria-labelledby="patient-profiles-title" aria-busy={loading || busy}>
    <h2 id="patient-profiles-title" tabIndex={-1} ref={heading}>Профили пациентов</h2>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Загрузка профилей…</p> : error ? <div><p className="notice error" role="alert">{error}</p><button className="btn" type="button" onClick={() => setAttempt((value) => value + 1)}>Обновить список</button></div> : editor ?
      <PatientProfileForm key={editor === "new" ? "new" : editor.id} profile={editor === "new" ? undefined : editor} busy={busy} onCancel={close} onSave={(payload) => mutate(editor === "new" ? "/patient-profiles" : `/patient-profiles/${encodeURIComponent(editor.id)}`, editor === "new" ? "POST" : "PATCH", payload)} /> : archive ?
      <div role="group" aria-labelledby="patient-profile-archive-title">
        <h3 id="patient-profile-archive-title">Архивировать профиль «{archive.fullName}»?</h3>
        <p>Профиль исчезнет из активного списка. Это не удаляет его данные.</p>
        <div className="patient-profile-actions">
          <button ref={cancelArchive} className="btn" type="button" disabled={busy} onClick={close}>Отмена</button>
          <button className="btn danger" type="button" disabled={busy} onClick={() => { if (archive.relationToOwner !== "self") void mutate(`/patient-profiles/${encodeURIComponent(archive.id)}/archive`, "POST"); }}>{busy ? "Сохранение…" : "Подтвердить архивацию"}</button>
        </div>
      </div> : <>
        <h3>Мой профиль</h3>
        {self.length ? <ul className="patient-profile-list">{self.map(row)}</ul> : <p>Основной профиль пока отсутствует.</p>}
        <h3>Зависимые профили</h3>
        {dependents.length ? <ul className="patient-profile-list">{dependents.map(row)}</ul> : <p>Зависимых профилей пока нет.</p>}
        <button className="btn primary" type="button" onClick={() => { setEditor("new"); setNotice(""); }}>Добавить профиль</button>
      </>}
  </section>;
}

function PatientProfileForm({ profile, busy, onCancel, onSave }: {
  profile?: PatientProfile;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, string>) => Promise<void>;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  useEffect(() => { nameInput.current?.focus(); }, []);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const fullName = String(data.get("fullName") || "").trim();
    const birthDate = String(data.get("birthDate") || "");
    const countryCode = String(data.get("countryCode") || "").trim().toUpperCase();
    if (!fullName || fullName.length > 200 || (birthDate && birthDate > today) || (countryCode && !/^[A-Z]{2}$/.test(countryCode))) {
      setError("Укажите имя, дату не позднее сегодняшней и двухбуквенный код страны.");
      return;
    }
    const payload: Record<string, string> = { fullName, sex: String(data.get("sex") || "unspecified") };
    if (birthDate) payload.birthDate = birthDate;
    if (countryCode) payload.countryCode = countryCode;
    if (!profile) payload.relationToOwner = String(data.get("relationToOwner"));
    setError("");
    void onSave(payload);
  }

  return <form onSubmit={submit}>
    <h3>{profile ? "Редактировать профиль" : "Новый зависимый профиль"}</h3>
    {error && <p className="notice error" role="alert">{error}</p>}
    <fieldset disabled={busy} className="patient-profile-fields">
      <legend className="sr-only">Данные профиля</legend>
      <label>Полное имя<input ref={nameInput} name="fullName" required maxLength={200} defaultValue={profile?.fullName || ""} autoComplete="off" /></label>
      <label>Дата рождения<input name="birthDate" type="date" max={today} required={Boolean(profile?.birthDate)} defaultValue={profile?.birthDate?.slice(0, 10) || ""} /></label>
      <label>Пол<select name="sex" defaultValue={profile?.sex || "unspecified"}>{Object.entries(sexes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Связь с владельцем<select name="relationToOwner" disabled={Boolean(profile)} defaultValue={profile?.relationToOwner || "child"}>{Object.entries(relations).filter(([value]) => Boolean(profile) || value !== "self").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Код страны (две латинские буквы)<input name="countryCode" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" required={Boolean(profile?.countryCode)} defaultValue={profile?.countryCode || ""} autoComplete="off" placeholder="DE" /></label>
    </fieldset>
    {profile && <p className="muted">Связь с владельцем не меняется. Указанные дату рождения и страну можно исправить, но нельзя очистить.</p>}
    <div className="patient-profile-actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</button><button className="btn" type="button" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </form>;
}
