"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import PhoneInput, { type Value } from "react-phone-number-input";
import { browserApi } from "@/lib/api";

type PatientProfile = {
  id: string;
  relationToOwner: string;
  birthDate?: string | null;
  phone?: string | null;
};

type ApiError = Error & { status?: number };

const E164_RE = /^\+[1-9]\d{1,14}$/;

export function CompleteProfileClient() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState<Value | undefined>(undefined);
  const submitInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    browserApi<PatientProfile[]>("/patient-profiles")
      .then((profiles) => {
        if (!active) return;
        const self = profiles.find((item) => item.relationToOwner === "self") ?? null;
        if (!self) {
          setLoadError("Основной профиль не найден.");
          return;
        }
        if (self.birthDate && self.phone) {
          window.location.assign("/profile");
          return;
        }
        setProfile(self);
        setBirthDate(self.birthDate?.slice(0, 10) ?? "");
        setPhone((self.phone ?? undefined) as Value | undefined);
      })
      .catch((error: ApiError) => {
        if (!active) return;
        if (error.status === 401) {
          window.location.assign("/login");
          return;
        }
        setLoadError("Не удалось загрузить профиль. Попробуйте ещё раз.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const now = new Date();
  const maxBirthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const valid = !!birthDate && birthDate <= maxBirthDate && typeof phone === "string" && E164_RE.test(phone);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || submitInFlight.current || !profile || !valid) return;
    submitInFlight.current = true;
    setSaving(true);
    setMessage("");
    try {
      await browserApi(`/patient-profiles/${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ birthDate, phone }),
      });
      window.location.assign("/profile");
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 401) {
        window.location.assign("/login");
        return;
      }
      setMessage("Не удалось сохранить. Проверьте данные и попробуйте ещё раз.");
      submitInFlight.current = false;
      setSaving(false);
    }
  }

  if (loading) return <div className="card" role="status">Загрузка профиля…</div>;
  if (loadError) {
    return (
      <div className="card">
        <p className="notice error" role="alert">{loadError}</p>
        <button className="btn" type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
      </div>
    );
  }
  if (!profile) return null;

  return (
    <section className="card">
      <form onSubmit={save}>
        {message && <p className="notice error" role="alert">{message}</p>}
        <fieldset disabled={saving} className="patient-profile-fields">
          <legend className="sr-only">Данные профиля</legend>
          <label>
            Дата рождения
            <input
              type="date"
              name="birthDate"
              max={maxBirthDate}
              required
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </label>
          <label>
            Телефон
            <PhoneInput
              international
              defaultCountry="RU"
              value={phone}
              onChange={setPhone}
              placeholder="Введите номер"
            />
          </label>
        </fieldset>
        <div className="patient-profile-actions">
          <button className="btn primary" type="submit" disabled={saving || !valid}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>
    </section>
  );
}
