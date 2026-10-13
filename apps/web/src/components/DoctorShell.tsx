"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  HomeIcon,
  UserGroupIcon,
  UserCircleIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

const items = [
  { href: "/doctor", label: "Сегодня", icon: HomeIcon },
  { href: "/doctor/calendar", label: "Календарь", icon: CalendarDaysIcon },
  { href: "/doctor/patients", label: "Пациенты", icon: UserGroupIcon },
  { href: "/doctor/profile", label: "Профиль", icon: UserCircleIcon },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/doctor") return pathname === "/doctor";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DoctorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="doctor-layout doctor-layout-v2">
      <aside className="doctor-sidebar doctor-sidebar-v2">
        <Link className="doctor-brand" href="/doctor">
          <span className="mark">M</span>
          <span><b>MediCare</b><small>кабинет специалиста</small></span>
        </Link>

        <div className="doctor-sidebar-label">Рабочее пространство</div>
        <nav className="doctor-menu doctor-menu-v2">
          {items.map(({ href, label, icon: Icon }) => (
            <Link aria-current={isActive(pathname, href) ? "page" : undefined} className={isActive(pathname, href) ? "active" : ""} key={href} href={href}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="doctor-sidebar-safe"><ShieldCheckIcon /><span><b>Защищённая зона</b><small>Доступ к данным пациентов контролируется системой прав.</small></span></div>
        <div className="doctor-sidebar-foot"><Link href="/"><ArrowLeftIcon /> Кабинет пациента</Link></div>
      </aside>

      <div className="doctor-main">
        <header className="doctor-topbar doctor-topbar-v2">
          <div><b>Рабочий кабинет</b><span>Медицинская зона</span></div>
          <Link className="account-pill" href="/profile"><span className="account-dot" /> Аккаунт</Link>
        </header>
        {children}
      </div>

      <nav className="doctor-mobile-nav doctor-mobile-nav-v2">
        {items.map(({ href, label, icon: Icon }) => (
          <Link aria-current={isActive(pathname, href) ? "page" : undefined} className={isActive(pathname, href) ? "active" : ""} key={href} href={href}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
