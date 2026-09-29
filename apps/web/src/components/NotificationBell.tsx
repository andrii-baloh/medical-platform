"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api";

export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    browserApi<{ count: number }>("/notifications/unread-count")
      .then((result) => { if (active) setCount(result.count); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <Link className="notification-bell" href="/notifications" aria-label="Уведомления">
      <span aria-hidden="true">◔</span>
      {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
    </Link>
  );
}
