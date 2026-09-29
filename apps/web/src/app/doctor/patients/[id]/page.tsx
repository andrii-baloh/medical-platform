import { DoctorShell } from "@/components/DoctorShell";
import { DoctorPatientClient } from "./DoctorPatientClient";
export default async function DoctorPatientPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <DoctorShell><DoctorPatientClient patientId={id}/></DoctorShell>}
