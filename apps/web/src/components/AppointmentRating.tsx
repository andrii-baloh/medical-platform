"use client";

import { StarIcon } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api";

type ReviewState = { appointmentId: string; completed: boolean; rating: number | null };

export function AppointmentRating({ appointmentId }: { appointmentId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    browserApi<ReviewState>(`/engagement/appointments/${appointmentId}/review`)
      .then((review) => setRating(review.rating))
      .catch(() => undefined);
  }, [appointmentId]);

  async function save(value: number) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await browserApi(`/engagement/appointments/${appointmentId}/review`, {
        method: "PUT",
        body: JSON.stringify({ rating: value }),
      });
      setRating(value);
      setMessage("Оценка сохранена.");
    } catch {
      setMessage("Не удалось сохранить оценку.");
    } finally {
      setBusy(false);
    }
  }

  const visible = hover ?? rating ?? 0;
  return (
    <section className="card appointment-rating-card">
      <div>
        <span className="eyebrow">После консультации</span>
        <h2>Оцените приём</h2>
        <p className="muted">Только оценка от 1 до 5. Медицинские подробности здесь не запрашиваются.</p>
      </div>
      <div className="rating-stars" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Оценка ${value} из 5`}
            className={value <= visible ? "active" : ""}
            disabled={busy}
            onMouseEnter={() => setHover(value)}
            onFocus={() => setHover(value)}
            onBlur={() => setHover(null)}
            onClick={() => void save(value)}
          >
            <StarIcon />
          </button>
        ))}
      </div>
      {rating && <small className="muted">Ваша оценка: {rating} из 5. Её можно изменить.</small>}
      {message && <div className={message.startsWith("Не") ? "notice error" : "notice success"}>{message}</div>}
    </section>
  );
}
