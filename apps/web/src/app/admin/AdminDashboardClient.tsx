"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDaysIcon, CreditCardIcon, ShieldCheckIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";

type Dashboard = {
  users: number;
  doctors: { total: number; pendingVerification: number };
  appointments: { total: number; active: number };
  payments: { total: number; paid: number };
};

export function AdminDashboardClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    browserApi<Dashboard>("/admin/dashboard").then(setData).catch((e: Error & { status?: number }) => {
      setError(e.status === 403 ? "У этого аккаунта нет роли администратора." : "Не удалось загрузить панель администратора.");
    });
  }, []);

  if (error) return <main className="admin-content"><div className="notice error"><b>Доступ запрещён</b><p>{error}</p></div></main>;
  if (!data) return <main className="admin-content"><div className="card">Загрузка панели…</div></main>;

  const metrics = [
    { label: "Активные пользователи", value: data.users, icon: ShieldCheckIcon },
    { label: "Врачи", value: data.doctors.total, sub: `${data.doctors.pendingVerification} ожидают проверки`, icon: UserGroupIcon },
    { label: "Активные записи", value: data.appointments.active, sub: `${data.appointments.total} всего`, icon: CalendarDaysIcon },
    { label: "Оплаченные платежи", value: data.payments.paid, sub: `${data.payments.total} платежей всего`, icon: CreditCardIcon },
  ];

  return (
    <main className="admin-content">
      <div className="admin-heading"><span className="eyebrow">Операционный обзор</span><h1>Платформа MediCare</h1><p>Сводка по пользователям, врачам, консультациям и платежам без доступа к клиническому тексту.</p></div>
      <section className="admin-metric-grid">
        {metrics.map(({ label, value, sub, icon: Icon }) => <article className="admin-metric" key={label}><div className="admin-metric-icon"><Icon /></div><div><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div></article>)}
      </section>
      <section className="admin-quick-grid">
        <Link href="/admin/doctors" className="admin-quick-card"><UserGroupIcon /><div><b>Проверка врачей</b><p>Верификация и публикация профессиональных профилей.</p></div></Link>
        <Link href="/admin/appointments" className="admin-quick-card"><CalendarDaysIcon /><div><b>Записи</b><p>Операционный статус консультаций без клинических заметок.</p></div></Link>
        <Link href="/admin/payments" className="admin-quick-card"><CreditCardIcon /><div><b>Платежи</b><p>Статусы транзакций и сверка платежного потока.</p></div></Link>
        <Link href="/admin/audit" className="admin-quick-card"><ShieldCheckIcon /><div><b>Audit trail</b><p>Системные действия и контроль доступа.</p></div></Link>
      </section>
    </main>
  );
}
