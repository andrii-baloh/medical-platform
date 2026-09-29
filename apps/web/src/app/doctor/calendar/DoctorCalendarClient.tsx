"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserApi } from "@/lib/api";
import { statusLabel } from "@/lib/format";

type Slot={id:string;startsAt:string;endsAt:string;status:string;appointment?:{id:string;status:string;patientName:string}|null};
type WorkingHour={id:string;weekday:number;start:string;end:string;timezone:string};
const weekday=["","Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

export function DoctorCalendarClient(){
 const [slots,setSlots]=useState<Slot[]>([]); const [hours,setHours]=useState<WorkingHour[]>([]); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
 const [start,setStart]=useState(""); const [end,setEnd]=useState("");
 const range=useMemo(()=>({from:new Date().toISOString(),to:new Date(Date.now()+31*86400000).toISOString()}),[]);
 const load=()=>Promise.all([
   browserApi<Slot[]>(`/doctor/slots?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
   browserApi<WorkingHour[]>("/doctor/working-hours")
 ]).then(([s,h])=>{setSlots(s);setHours(h)}).catch(()=>setMessage("Не удалось загрузить расписание."));
 useEffect(()=>{void load()},[]);
 const create=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage("");try{await browserApi("/doctor/slots",{method:"POST",body:JSON.stringify({slots:[{startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}]})});setStart("");setEnd("");await load();setMessage("Свободное время добавлено.")}catch(err:any){setMessage(err.message||"Не удалось добавить слот")}finally{setBusy(false)}};
 const toggle=async(s:Slot)=>{setBusy(true);try{await browserApi(`/doctor/slots/${s.id}/${s.status==="blocked"?"unblock":"block"}`,{method:"POST",body:"{}"});await load()}finally{setBusy(false)}};
 const grouped=slots.reduce<Record<string,Slot[]>>((acc,s)=>{const k=new Date(s.startsAt).toLocaleDateString("ru-RU",{weekday:"long",day:"2-digit",month:"long"});(acc[k]??=[]).push(s);return acc},{});
 return <main className="doctor-content">
   <div className="doctor-heading"><div><div className="eyebrow">Расписание</div><h1>Рабочий календарь</h1><p className="muted">Конкретные слоты являются источником истины для бронирования.</p></div></div>
   {message&&<div className="notice">{message}</div>}
   <section className="calendar-layout">
    <div className="stack">
      {Object.entries(grouped).map(([day,items])=><section className="card" key={day}><h3 className="capitalize">{day}</h3><div className="slot-list">
        {items.map(s=><div className="doctor-slot" key={s.id}>
          <div><b>{new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(s.startsAt))}–{new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(s.endsAt))}</b><small className="muted">{statusLabel(s.status)}</small></div>
          {s.appointment?<Link className="btn small" href={`/doctor/appointments/${s.appointment.id}`}>{s.appointment.patientName}</Link>:<button disabled={busy} className="btn small" onClick={()=>toggle(s)}>{s.status==="blocked"?"Открыть":"Закрыть"}</button>}
        </div>)}
      </div></section>)}
      {slots.length===0&&<div className="card empty">На ближайшие 31 день слотов пока нет.</div>}
    </div>
    <aside className="stack">
      <form className="card stack" onSubmit={create}><h3>Добавить свободное время</h3><label>Начало<input className="field" type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Окончание<input className="field" type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label><button disabled={busy} className="btn primary">Добавить слот</button></form>
      <div className="card"><h3>Обычные рабочие часы</h3><div className="stack compact">{hours.map(h=><div className="between row" key={h.id}><span>{weekday[h.weekday]}</span><b>{h.start}–{h.end}</b></div>)}</div><p className="muted tiny">Рабочие часы — шаблон. Запись пациента возможна только в созданный свободный слот.</p></div>
    </aside>
   </section>
 </main>
}
