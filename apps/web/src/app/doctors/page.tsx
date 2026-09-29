import Link from "next/link";
import { Chrome } from "@/components/Chrome";
import { publicApi } from "@/lib/api";

type Doctor={id:string;slug:string;fullName:string;specialty:string;experienceYears:number;rating:number;reviewCount:number;price:{amountMinor:number;currency:string};languages:string[];initials?:string};
const money=(x:Doctor["price"])=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:x.currency,maximumFractionDigits:0}).format(x.amountMinor/100);
export default async function Doctors(){const doctors=await publicApi<Doctor[]>("/v1/doctors");return <Chrome><main className="content"><h1>Специалисты</h1><p className="muted">Проверенные профили и реальные свободные интервалы.</p><div className="doctor-list" style={{marginTop:18}}>{doctors.map(d=><Link className="card" href={`/doctors/${d.slug}`} key={d.id}><div className="row"><div className="avatar">{d.initials||d.fullName.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div style={{flex:1}}><div className="doc-name">{d.fullName}</div><div className="muted">{d.specialty} · стаж {d.experienceYears} лет</div><div style={{marginTop:7,fontSize:14}}>★ {d.rating.toFixed(2)} · {d.reviewCount} отзывов</div></div><div className="price">{money(d.price)}</div></div></Link>)}</div></main></Chrome>}
