"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api";
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";
type Consultation={id:string;version:number;complaints?:string|null;anamnesis?:string|null;assessment?:string|null;recommendations?:string|null;signedAt?:string|null};
type Data={id:string;status:string;reason?:string|null;startsAt:string;endsAt:string;patient:{id:string;fullName:string;birthDate?:string|null;sex?:string|null};consultation?:Consultation|null;documents:Array<{id:string;originalName:string;category:string;sizeBytes:number}>};
type Version={version:number;contentSha256:string;signedAt:string;snapshot:any};
export function DoctorConsultationClient({appointmentId}:{appointmentId:string}){
 const[data,setData]=useState<Data|null>(null);const[versions,setVersions]=useState<Version[]>([]);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");const[draft,setDraft]=useState({complaints:"",anamnesis:"",assessment:"",recommendations:""});
 const load=async()=>{const d=await browserApi<Data>(`/doctor/appointments/${appointmentId}`);setData(d);setDraft({complaints:d.consultation?.complaints||"",anamnesis:d.consultation?.anamnesis||"",assessment:d.consultation?.assessment||"",recommendations:d.consultation?.recommendations||""});const v=await browserApi<Version[]>(`/doctor/appointments/${appointmentId}/consultation/versions`).catch(()=>[]);setVersions(v)};
 useEffect(()=>{void load().catch(()=>setMsg("Не удалось открыть приём."))},[appointmentId]);
 const action=async(fn:()=>Promise<any>,ok:string)=>{setBusy(true);setMsg("");try{await fn();await load();setMsg(ok)}catch(e:any){setMsg(e.message||"Операция не выполнена")}finally{setBusy(false)}};
 const save=()=>action(()=>browserApi(`/doctor/appointments/${appointmentId}/consultation`,{method:"PUT",body:JSON.stringify(draft)}),"Черновик сохранён.");
 const sign=()=>action(()=>browserApi(`/doctor/appointments/${appointmentId}/consultation/sign`,{method:"POST",body:"{}"}),"Заключение подписано и зафиксировано.");
 const start=()=>action(()=>browserApi(`/doctor/appointments/${appointmentId}/start`,{method:"POST",body:"{}"}),"Консультация начата.");
 const amend=()=>action(()=>browserApi(`/doctor/appointments/${appointmentId}/consultation/amend`,{method:"POST",body:"{}"}),"Создана новая версия для дополнения.");
 const complete=()=>action(()=>browserApi(`/doctor/appointments/${appointmentId}/complete`,{method:"POST",body:"{}"}),"Консультация завершена.");
 const openDoc=async(id:string)=>{const r=await browserApi<{url:string}>(`/documents/${id}/download-url`);window.open(r.url,"_blank","noopener,noreferrer")};
 if(!data)return <main className="doctor-content"><div className={msg?"notice error":"card"}>{msg||"Загрузка приёма…"}</div></main>;
 const locked=Boolean(data.consultation?.signedAt);
 return <main className="doctor-content consultation-page">
  <div className="doctor-heading"><div><Link className="back" href="/doctor">← Сегодня</Link><h1>Консультация</h1><p className="muted">{formatDateTime(data.startsAt)} · <span className={`status status-${data.status}`}>{statusLabel(data.status)}</span></p></div><div className="consult-actions">{["confirmed","patient_checked_in"].includes(data.status)&&<button disabled={busy} onClick={start} className="btn primary">Начать приём</button>}{data.status==="in_progress"&&<button disabled={busy} onClick={complete} className="btn primary">Завершить</button>}</div></div>
  {msg&&<div className="notice">{msg}</div>}
  <div className="consult-grid">
   <section className="stack">
    <div className="card patient-summary"><div className="between row"><div><div className="eyebrow">Пациент</div><h2>{data.patient.fullName}</h2><p className="muted">Дата рождения: {formatDate(data.patient.birthDate)}</p></div><Link className="btn small" href={`/doctor/patients/${data.patient.id}`}>Карточка</Link></div><div className="reason-box"><b>Причина обращения</b><p>{data.reason||"Не указана"}</p></div></div>
    <div className="card stack"><div className="between row"><div><div className="eyebrow">Медицинское заключение</div><h2>Версия {data.consultation?.version||1}</h2></div>{locked&&<span className="signed-badge">✓ Подписано</span>}</div>
     <label>Жалобы<textarea disabled={locked} className="field textarea" value={draft.complaints} onChange={e=>setDraft({...draft,complaints:e.target.value})}/></label>
     <label>Анамнез<textarea disabled={locked} className="field textarea" value={draft.anamnesis} onChange={e=>setDraft({...draft,anamnesis:e.target.value})}/></label>
     <label>Оценка / заключение<textarea disabled={locked} className="field textarea" value={draft.assessment} onChange={e=>setDraft({...draft,assessment:e.target.value})}/></label>
     <label>Рекомендации<textarea disabled={locked} className="field textarea" value={draft.recommendations} onChange={e=>setDraft({...draft,recommendations:e.target.value})}/></label>
     <div className="row wrap">{!locked&&<><button disabled={busy} className="btn" onClick={save}>Сохранить черновик</button><button disabled={busy} className="btn primary" onClick={sign}>Подписать версию</button></>}{locked&&<button disabled={busy} className="btn" onClick={amend}>Создать дополнение</button>}</div>
    </div>
   </section>
   <aside className="stack">
    <div className="card"><h3>Документы пациента</h3><div className="stack compact">{data.documents.map(d=><button className="document-link" key={d.id} onClick={()=>openDoc(d.id)}><span>▤</span><div><b>{d.originalName}</b><small>{d.category}</small></div></button>)}{data.documents.length===0&&<p className="muted">Доступных документов нет.</p>}</div></div>
    <div className="card"><h3>Подписанные версии</h3><div className="version-list">{versions.map(v=><details key={v.version}><summary>Версия {v.version} · {formatDateTime(v.signedAt)}</summary><p><b>SHA-256</b><br/><code>{v.contentSha256}</code></p><p>{v.snapshot.assessment||"Без текста заключения"}</p></details>)}{versions.length===0&&<p className="muted">Пока нет подписанных версий.</p>}</div></div>
   </aside>
  </div>
 </main>
}
