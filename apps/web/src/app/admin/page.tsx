import { AdminShell } from "@/components/AdminShell";
import { AdminDashboardClient } from "./AdminDashboardClient";

export default function AdminPage() {
  return <AdminShell><AdminDashboardClient /></AdminShell>;
}
