import { Chrome } from "@/components/Chrome";
import { BookingClient } from "./BookingClient";
export default async function Book({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <Chrome><main className="content"><h1>Запись на консультацию</h1><p className="muted">Время показывается в часовом поясе вашего профиля.</p><BookingClient slug={slug}/></main></Chrome>}
