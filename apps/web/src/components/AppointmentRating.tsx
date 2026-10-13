"use client";

import { StarIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import { browserApi } from "@/lib/api";

type ReviewState = { appointmentId: string; completed: boolean; rating: number | null };
type ApiError = Error & { status?: number };

function reviewError(error: unknown) {
  switch ((error as ApiError).status) {
    case 401: return "Войдите в аккаунт, чтобы оценить приём.";
    case 403: case 404: return "Оценка этой консультации недоступна.";
    case 409: return "Оценку сейчас изменить нельзя. Обновите данные консультации.";
    case 400: return "Выберите оценку от 1 до 5.";
    default: return "Не удалось получить подтверждение от сервера. Попробуйте ещё раз.";
  }
}

export function AppointmentRating({ appointmentId }: { appointmentId: string }) {
  return <AppointmentRatingControl key={appointmentId} appointmentId={appointmentId} />;
}

function AppointmentRatingControl({ appointmentId }: { appointmentId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    browserApi<ReviewState>(`/engagement/appointments/${appointmentId}/review`)
      .then((review) => {
        if (!active) return;
        setRating(review.rating);
        setCompleted(review.completed);
        setNeedLogin(false);
      })
      .catch((error: ApiError) => {
        if (!active) return;
        setError(reviewError(error));
        setNeedLogin(error.status === 401);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId, attempt]);

  async function save(value: number) {
    if (pending.current || loading || !completed || needLogin || !Number.isInteger(value) || value < 1 || value > 5) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await browserApi(`/engagement/appointments/${appointmentId}/review`, {
        method: "PUT",
        body: JSON.stringify({ rating: value }),
      });
      setRating(value);
      setMessage("Оценка сохранена.");
    } catch (error) {
      setError(reviewError(error));
      setNeedLogin((error as ApiError).status === 401);
      setCompleted(false);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const visible = hover ?? rating ?? 0;
  if (loading) return <div className="card" role="status">Загрузка оценки…</div>;
  if (!completed && !error) return null;
  return (
    <section className="card appointment-rating-card">
      <div>
        <span className="eyebrow">После консультации</span>
        <h2>Оцените приём</h2>
        <p className="muted">Только оценка от 1 до 5. Медицинские подробности здесь не запрашиваются.</p>
      </div>
      <div className="rating-stars" role="group" aria-label="Оценка приёма от 1 до 5" aria-busy={busy} onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Оценка ${value} из 5`}
            aria-pressed={rating === value}
            className={value <= visible ? "active" : ""}
            disabled={busy || !completed || needLogin}
            onMouseEnter={() => setHover(value)}
            onFocus={() => setHover(value)}
            onBlur={() => setHover(null)}
            onClick={() => void save(value)}
          >
            <StarIcon aria-hidden="true" />
          </button>
        ))}
      </div>
      {rating && <small className="muted">Ваша оценка: {rating} из 5. Её можно изменить.</small>}
      <div role="status">{busy ? "Сохранение оценки…" : message}</div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {needLogin ? <a className="btn" href="/login">Войти</a> : error && <button className="btn" type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Повторить загрузку оценки</button>}
    </section>
  );
}
