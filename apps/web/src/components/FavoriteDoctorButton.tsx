"use client";

import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api";

type Favorite = { id: string };
type ApiError = Error & { status?: number };

export function FavoriteDoctorButton({ doctorId }: { doctorId: string }) {
  const [favorite, setFavorite] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    browserApi<Favorite[]>("/engagement/favorites")
      .then((items) => {
        setFavorite(items.some((item) => item.id === doctorId));
        setAuthenticated(true);
      })
      .catch((error: ApiError) => setAuthenticated(error.status === 401 ? false : null));
  }, [doctorId]);

  async function toggle() {
    if (authenticated === false) {
      window.location.assign("/login");
      return;
    }
    if (authenticated !== true || busy) return;
    setBusy(true);
    try {
      await browserApi(`/engagement/favorites/${doctorId}`, {
        method: favorite ? "DELETE" : "POST",
        ...(favorite ? {} : { body: "{}" }),
      });
      setFavorite((value) => !value);
    } finally {
      setBusy(false);
    }
  }

  const Icon = favorite ? HeartSolidIcon : HeartIcon;
  return (
    <button className={`btn favorite-doctor-btn ${favorite ? "active" : ""}`} type="button" disabled={busy} onClick={toggle}>
      <Icon /> {favorite ? "В избранном" : "В избранное"}
    </button>
  );
}
