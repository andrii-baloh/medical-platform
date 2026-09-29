import { DoctorShell } from "@/components/DoctorShell";
import { DoctorConsultationClient } from "./DoctorConsultationClient";
export default async function DoctorAppointmentPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <DoctorShell><DoctorConsultationClient appointmentId={id}/></DoctorShell>}
