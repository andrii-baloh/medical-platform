import Link from "next/link";

const items = [
  ["/doctor","Сегодня","⌂"],
  ["/doctor/calendar","Календарь","▦"],
  ["/doctor/patients","Пациенты","◉"],
  ["/doctor/profile","Профиль","⚙"],
] as const;

export function DoctorShell({ children }: { children: React.ReactNode }) {
  return <div className="doctor-layout">
    <aside className="doctor-sidebar">
      <Link className="doctor-brand" href="/doctor"><span className="mark">M</span><span><b>MediCare</b><small>кабинет специалиста</small></span></Link>
      <nav className="doctor-menu">
        {items.map(([href,label,icon]) => <Link key={href} href={href}><span>{icon}</span>{label}</Link>)}
      </nav>
      <div className="doctor-sidebar-foot"><Link href="/">← Кабинет пациента</Link></div>
    </aside>
    <div className="doctor-main">
      <header className="doctor-topbar"><div><b>Рабочий кабинет</b><span className="muted"> защищённая медицинская зона</span></div><Link className="chip" href="/profile">Аккаунт</Link></header>
      {children}
    </div>
    <nav className="doctor-mobile-nav">
      {items.map(([href,label,icon]) => <Link key={href} href={href}><strong>{icon}</strong>{label}</Link>)}
    </nav>
  </div>;
}
