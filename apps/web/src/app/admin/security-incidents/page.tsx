import { AdminShell } from "@/components/AdminShell";
import { SecurityIncidentsClient } from "./SecurityIncidentsClient";

export default function SecurityIncidentsPage() {
  return <AdminShell><SecurityIncidentsClient /></AdminShell>;
}
