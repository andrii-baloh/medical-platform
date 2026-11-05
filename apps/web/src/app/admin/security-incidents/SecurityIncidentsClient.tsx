"use client";

import { useState } from "react";
import { staffRequest, StaffLoadState, useStaffResource } from "@/components/StaffRequest";

type Incident = {
  id:string;title:string;incidentType:string;severity:string;status:string;detectedAt:string;
  personalDataBreach:string;rightsAffected:boolean;regulatorNotification:string;
  initialDeadline:string|null;finalDeadline:string|null;initialNotifiedAt:string|null;
  finalNotifiedAt:string|null;initialOverdue:boolean;finalOverdue:boolean;
  containmentActions:string;finalReport:string|null;
};
type Event = {id:number;action:string;event_at:string;details:Record<string,unknown>};
type IncidentDetail=Incident&{events:Event[]};
const statusOptions=["detected","triage","contained","investigating","resolved","closed"];
const typeOptions=["unauthorized_access","data_disclosure","malware","account_compromise","availability","integrity","other"];
const severityOptions=["low","medium","high","critical"];
function when(value:string|null) {return value?new Date(value).toLocaleString("ru-RU"):"—";}
function choices(items:string[]) {return items.map(item=><option key={item} value={item}>{item}</option>);}

export function SecurityIncidentsClient() {
  const incidents=useStaffResource<Incident[]>("/admin/security-incidents?limit=100");
  const [selected,setSelected]=useState<string|null>(null);
  const detail=useStaffResource<IncidentDetail>(selected?"/admin/security-incidents/"+selected:"/admin/security-incidents?limit=1");
  const [title,setTitle]=useState("");
  const [incidentType,setIncidentType]=useState("unauthorized_access");
  const [severity,setSeverity]=useState("medium");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [containment,setContainment]=useState("");
  const [report,setReport]=useState("");
  const [reference,setReference]=useState("");
  const [noticeKind,setNoticeKind]=useState<"initial"|"final">("initial");

  async function perform(fn:()=>Promise<unknown>) {
    setBusy(true);setError("");setSuccess("");
    try {await fn();await incidents.reload();await detail.reload();setSuccess("Изменения сохранены.");}
    catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }
  async function create() {
    if(title.trim().length<3)return;
    await perform(async()=>{
      const item=await staffRequest<Incident>("/admin/security-incidents",{method:"POST",body:JSON.stringify({title,incidentType,severity})});
      setTitle("");setSelected(item.id);
    });
  }
  async function update(fields:Record<string,unknown>) {
    if(!selected)return;
    await perform(()=>staffRequest("/admin/security-incidents/"+selected,{method:"PATCH",body:JSON.stringify(fields)}));
  }
  async function notify() {
    if(!selected||reference.trim().length<3)return;
    await perform(async()=>{await staffRequest("/admin/security-incidents/"+selected+"/notifications",{method:"POST",body:JSON.stringify({kind:noticeKind,reference})});setReference("");});
  }
  const current=detail.data;
  return <main className="admin-content">
    <div className="admin-heading"><span className="eyebrow">STAGE 21 · SECURITY</span><h1>Инциденты информационной безопасности</h1>
      <p>Расследование, меры сдерживания, неизменяемая история и учёт уведомлений. Система не отправляет уведомления регулятору автоматически.</p></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {success&&<div className="notice success" role="status">{success}</div>}
    <section className="card" style={{padding:24,marginBottom:24}}>
      <h2>Зарегистрировать инцидент</h2>
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:14}}>
        <input className="field" aria-label="Описание инцидента" placeholder="Краткое название инцидента" value={title} onChange={e=>setTitle(e.target.value)} style={{flex:"1 1 250px"}}/>
        <select className="field" aria-label="Тип" value={incidentType} onChange={e=>setIncidentType(e.target.value)}>{choices(typeOptions)}</select>
        <select className="field" aria-label="Критичность" value={severity} onChange={e=>setSeverity(e.target.value)}>{choices(severityOptions)}</select>
        <button className="btn primary" disabled={busy||title.trim().length<3} onClick={()=>void create()}>Создать</button>
      </div>
    </section>
    <section className="card" style={{padding:24,marginBottom:24}}>
      <h2>Журнал инцидентов</h2>
      <StaffLoadState loading={incidents.loading} error={incidents.error} retry={incidents.reload}/>
      <div style={{display:"grid",gap:8,marginTop:14}}>
        {(incidents.data??[]).map(item=><button key={item.id} className="btn" type="button"
          style={{display:"flex",justifyContent:"space-between",textAlign:"left",gap:12,whiteSpace:"normal"}}
          aria-pressed={selected===item.id} onClick={()=>{setSelected(item.id);setContainment("");setReport("");}}>
          <span><b>{item.title}</b><small style={{display:"block"}}>{item.incidentType} · {when(item.detectedAt)}</small></span>
          <span><b>{item.severity}</b><small style={{display:"block"}}>{item.status}</small></span>
        </button>)}
        {!incidents.loading&&!(incidents.data??[]).length&&<p>Зарегистрированных инцидентов нет.</p>}
      </div>
    </section>
    {selected&&<section className="card" style={{padding:24,display:"grid",gap:18}}>
      <StaffLoadState loading={detail.loading} error={detail.error} retry={detail.reload}/>
      {current&&<>
        <h2>{current.title}</h2>
        <p>Статус: <b>{current.status}</b> · Критичность: <b>{current.severity}</b></p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <label>Этап расследования <select className="field" value={current.status} disabled={busy||current.status==="closed"} onChange={e=>void update({status:e.target.value})}>{choices(statusOptions)}</select></label>
          <label>Утечка персональных данных <select className="field" value={current.personalDataBreach} disabled={busy||current.status==="closed"} onChange={e=>void update({personalDataBreach:e.target.value})}>{choices(["undetermined","confirmed","ruled_out"])}</select></label>
          <label style={{display:"flex",alignItems:"center",gap:8}}>Нарушены права субъектов <input type="checkbox" checked={current.rightsAffected} disabled={busy||current.status==="closed"} onChange={e=>void update({rightsAffected:e.target.checked})}/></label>
        </div>
        <div className="notice"><b>Регулятор:</b> {current.regulatorNotification}. Сроки 24/72 часа применяются для подтверждённого инцидента, затрагивающего права субъектов.
          {current.initialDeadline&&<p>Первичное: {when(current.initialDeadline)} {current.initialOverdue?"— ПРОСРОЧЕНО":""}</p>}
          {current.finalDeadline&&<p>Дополнительное: {when(current.finalDeadline)} {current.finalOverdue?"— ПРОСРОЧЕНО":""}</p>}
        </div>
        <label>Меры локализации<textarea className="field" style={{width:"100%",minHeight:90}} maxLength={4000} value={containment} placeholder={current.containmentActions||"Опишите принятые меры"} onChange={e=>setContainment(e.target.value)}/></label>
        <button className="btn" disabled={busy||!containment.trim()||current.status==="closed"} onClick={()=>void update({containmentActions:containment})}>Сохранить меры</button>
        <label>Итоговый отчёт<textarea className="field" style={{width:"100%",minHeight:110}} maxLength={8000} value={report} placeholder={current.finalReport||"Выводы расследования"} onChange={e=>setReport(e.target.value)}/></label>
        <button className="btn" disabled={busy||!report.trim()||current.status==="closed"} onClick={()=>void update({finalReport:report})}>Сохранить отчёт</button>
        {current.personalDataBreach==="confirmed"&&current.rightsAffected&&<div style={{display:"grid",gap:8}}>
          <h3>Учёт фактически отправленного уведомления</h3>
          <p>Записывайте подтверждение только после реальной отправки вне платформы.</p>
          <select className="field" value={noticeKind} onChange={e=>setNoticeKind(e.target.value as "initial"|"final")}>{choices(["initial","final"])}</select>
          <input className="field" placeholder="Регистрационный номер / подтверждение" value={reference} onChange={e=>setReference(e.target.value)}/>
          <button className="btn" disabled={busy||reference.trim().length<3} onClick={()=>void notify()}>Зафиксировать отправку</button>
        </div>}
        <h3>Неизменяемая история</h3>
        <div style={{display:"grid",gap:8}}>{current.events.map(event=><div key={event.id} style={{borderTop:"1px solid #aaa",paddingTop:8}}>
          <b>{event.action}</b> · {when(event.event_at)}<small style={{display:"block"}}>{JSON.stringify(event.details)}</small>
        </div>)}</div>
      </>}
    </section>}
  </main>;
}
