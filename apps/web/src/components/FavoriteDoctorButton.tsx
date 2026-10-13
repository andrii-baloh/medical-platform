"use client";

import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import { browserApi } from "@/lib/api";

type Favorite = { id: string };
type ApiError = Error & { status?: number };

export function FavoriteDoctorButton({ doctorId }: { doctorId: string }) {
  return <FavoriteDoctorControl key={doctorId} doctorId={doctorId} />;
}

function FavoriteDoctorControl({ doctorId }: { doctorId: string }) {
  const [favorite, setFavorite] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    browserApi<Favorite[]>("/engagement/favorites")
      .then((items) => {
        if (!active) return;
        setFavorite(items.some((item) => item.id === doctorId));
        setAuthenticated(true);
      })
      .catch((error: ApiError) => {
        if (!active) return;
        if (error.status === 401) setAuthenticated(false);
        else setError("Не удалось загрузить избранное. Попробуйте ещё раз.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [doctorId, attempt]);

  async function toggle() {
    if (authenticated === false) {
      window.location.assign("/login");
      return;
    }
    if (authenticated !== true || loading || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await browserApi(`/engagement/favorites/${doctorId}`, {
        method: favorite ? "DELETE" : "POST",
        ...(favorite ? {} : { body: "{}" }),
      });
      setFavorite(!favorite);
    } catch (error) {
      if ((error as ApiError).status === 401) {
        setAuthenticated(false);
        window.location.assign("/login");
      } else {
        setError((error as ApiError).status === 404 ? "Врач больше недоступен." : "Не удалось изменить избранное. Попробуйте ещё раз.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const Icon = favorite ? HeartSolidIcon : HeartIcon;
  return (
    <div className="favorite-doctor-control">
      <button className={`btn favorite-doctor-btn ${favorite ? "active" : ""}`} type="button" aria-pressed={favorite} aria-busy={loading || busy} disabled={loading || busy || authenticated === null} onClick={() => void toggle()}>
        <Icon aria-hidden="true" /> {loading ? "Загрузка избранного…" : busy ? "Сохранение…" : authenticated === false ? "Войти, чтобы добавить" : favorite ? "В избранном" : "В избранное"}
      </button>
      {error && <p className="notice error" role="alert">{error}</p>}
      {error && authenticated === null && <button className="btn" type="button" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>Повторить загрузку</button>}
    </div>
  );
}
