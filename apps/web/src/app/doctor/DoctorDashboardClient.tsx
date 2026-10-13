"use client";

import Link from "next/link";
import { CalendarDaysIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useStaffResource, StaffLoadState } from "@/components/StaffRequest";
import { statusLabel } from "@/lib/format";

type Dashboard = {
  doctor: { id: string; fullName: string; initials?: string | null; timezone: string };
  metrics: { completed_month: number; upcoming: number; patients_total: number };
  today: Array<{ id: string; status: string; reason?: string | null; startsAt: string; endsAt: string; patient: { id: string; fullName: string } }>;
};
type ApiError = Error & { status?: number };

export function DoctorDashboardClient() {
  const { data: loaded, loading, error, reload } = useStaffResource<Dashboard>("/doctor/dashboard");
  const data = loaded;

  if (!data) return <main className="doctor-content"><StaffLoadState loading={loading} error={error} retry={reload} /></main>;

  const metrics = [
    { label: "Предстоящие", value: data.metrics.upcoming, icon: CalendarDaysIcon },
    { label: "Пациенты", value: data.metrics.patients_total, icon: UserGroupIcon },
    { label: "Завершено в этом месяце", value: data.metrics.completed_month, icon: CheckCircleIcon },
  ];

  return (
    <main className="doctor-content doctor-dashboard-v2">
      <section className="doctor-heading doctor-heading-v2">
        <div><span className="eyebrow">Сегодня</span><h1>{data.doctor.fullName}</h1><p>Часовой пояс: {data.doctor.timezone}</p></div>
        <div className="doctor-profile-badge"><div className="avatar xl">{data.doctor.initials || "MD"}</div><span>Профиль специалиста</span></div>
      </section>

      <section className="metric-grid metric-grid-v2">
        {metrics.map(({ label, value, icon: Icon }) => <article className="metric metric-v2" key={label}><div className="metric-icon"><Icon /></div><div><span>{label}</span><b>{value}</b></div></article>)}
      </section>

      <section className="doctor-section-block">
        <div className="section-row doctor-section-row"><div><span className="eyebrow">Расписание</span><h2>Приёмы сегодня</h2></div><Link href="/doctor/calendar">Открыть календарь <ChevronRightIcon /></Link></div>
        <div className="doctor-today-list">
          {data.today.length === 0 && <div className="card empty-state-modern"><CalendarDaysIcon /><h3>На сегодня записей нет</h3><p>Новые записи появятся здесь автоматически.</p></div>}
          {data.today.map((appointment) => <Link className="doctor-appointment-card" href={`/doctor/appointments/${appointment.id}`} key={appointment.id}>
            <div className="doctor-appointment-time"><ClockIcon /><b>{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.startsAt))}</b></div>
            <div className="grow"><h3>{appointment.patient.fullName}</h3><p>{appointment.reason || "Причина обращения не указана"}</p></div>
            <span className={`status status-${appointment.status}`}>{statusLabel(appointment.status)}</span>
            <ChevronRightIcon className="doctor-row-arrow" />
          </Link>)}
        </div>
      </section>

      <section className="doctor-quick-grid doctor-quick-grid-v2">
        <Link className="doctor-quick-card" href="/doctor/calendar"><CalendarDaysIcon /><div><b>Управлять расписанием</b><p>Свободные интервалы, блокировки и записи пациентов.</p></div><ChevronRightIcon /></Link>
        <Link className="doctor-quick-card" href="/doctor/patients"><UserGroupIcon /><div><b>База пациентов</b><p>История консультаций и доступные документы.</p></div><ChevronRightIcon /></Link>
      </section>
    </main>
  );
}
