"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api";
import { formatDateTime, statusLabel } from "@/lib/format";

type Dashboard = {
  doctor:{id:string;fullName:string;initials?:string|null;timezone:string};
  metrics:{completed_month:number;upcoming:number;patients_total:number};
  today:Array<{id:string;status:string;reason?:string|null;startsAt:string;endsAt:string;patient:{id:string;fullName:string}}>
};

export function DoctorDashboardClient(){
  const [data,setData]=useState<Dashboard|null>(null); const [error,setError]=useState("");
  const load=()=>browserApi<Dashboard>("/doctor/dashboard").then(setData).catch(e=>setError(e.status===403?"Этот аккаунт не связан с подтверждённым профилем специалиста.":"Не удалось загрузить кабинет."));
  useEffect(()=>{void load()},[]);
  if(error) return <main className="doctor-content"><div className="notice error"><b>Доступ к кабинету специалиста</b><p>{error}</p><Link className="btn" href="/login">Войти другим аккаунтом</Link></div></main>;
  if(!data) return <main className="doctor-content"><div className="card">Загрузка рабочего кабинета…</div></main>;
  return <main className="doctor-content">
    <section className="doctor-heading"><div><div className="eyebrow">Сегодня</div><h1>{data.doctor.fullName}</h1><p className="muted">Часовой пояс: {data.doctor.timezone}</p></div><div className="avatar xl">{data.doctor.initials||"MD"}</div></section>
    <section className="metric-grid">
      <div className="metric"><span>Предстоящие</span><b>{data.metrics.upcoming}</b></div>
      <div className="metric"><span>Пациенты</span><b>{data.metrics.patients_total}</b></div>
      <div className="metric"><span>Завершено в месяце</span><b>{data.metrics.completed_month}</b></div>
    </section>
    <div className="section-row"><h2>Приёмы сегодня</h2><Link href="/doctor/calendar">Открыть календарь →</Link></div>
    <section className="stack">
      {data.today.length===0 && <div className="card empty">На сегодня записей нет.</div>}
      {data.today.map(a=><Link className="appointment-row" href={`/doctor/appointments/${a.id}`} key={a.id}>
        <div className="appointment-time">{new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(a.startsAt))}</div>
        <div className="grow"><b>{a.patient.fullName}</b><div className="muted clamp">{a.reason||"Причина обращения не указана"}</div></div>
        <span className={`status status-${a.status}`}>{statusLabel(a.status)}</span>
      </Link>)}
    </section>
    <section className="doctor-quick-grid">
      <Link className="card" href="/doctor/calendar"><b>Управлять расписанием</b><p className="muted">Открывать и закрывать слоты, видеть записи.</p></Link>
      <Link className="card" href="/doctor/patients"><b>База пациентов</b><p className="muted">История ваших консультаций и разрешённые документы.</p></Link>
    </section>
  </main>
}
