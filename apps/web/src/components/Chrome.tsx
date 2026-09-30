import Link from "next/link";
import { auth } from "@/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { PatientNav } from "@/components/PatientNav";

export async function Chrome({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="patient-shell">
      <header className="patient-header">
        <div className="patient-header-inner">
          <Link className="brand brand-large" href="/">
            <span className="mark">M</span>
            <span><b>MediCare</b><small>онлайн-консультации</small></span>
          </Link>
          <PatientNav />
          <div className="patient-header-actions">
            {session && <NotificationBell />}
            <Link className="account-pill" href={session ? "/profile" : "/login"}>
              <span className="account-dot" />
              {session ? "Мой профиль" : "Войти"}
            </Link>
          </div>
        </div>
      </header>
      <div className="patient-page">{children}</div>
    </div>
  );
}
