"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  EnvelopeIcon,
  HomeIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

const items = [
  { href: "/admin", label: "Обзор", icon: HomeIcon },
  { href: "/admin/doctors", label: "Врачи", icon: UserGroupIcon },
  { href: "/admin/appointments", label: "Записи", icon: CalendarDaysIcon },
  { href: "/admin/payments", label: "Платежи", icon: CreditCardIcon },
  { href: "/admin/support", label: "Поддержка", icon: ChatBubbleLeftRightIcon },
  { href: "/admin/notifications", label: "Доставка", icon: EnvelopeIcon },
  { href: "/admin/audit", label: "Аудит", icon: ClipboardDocumentListIcon },
] as const;

function active(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/admin" className="doctor-brand">
          <span className="mark">M</span>
          <span><b>MediCare</b><small>администрирование</small></span>
        </Link>
        <div className="admin-sidebar-label">Управление платформой</div>
        <nav className="admin-menu">
          {items.map(({ href, label, icon: Icon }) => (
            <Link aria-current={active(pathname, href) ? "page" : undefined} key={href} href={href} className={active(pathname, href) ? "active" : ""}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-security-note"><ShieldCheckIcon /><span><b>Администратор</b><small>Клинические записи пациента не показываются в административном интерфейсе.</small></span></div>
        <Link className="admin-back" href="/"><ArrowLeftIcon /> Вернуться на платформу</Link>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><div><b>Панель администратора</b><span>Операционная зона</span></div><Link className="account-pill" href="/profile"><span className="account-dot" /> Аккаунт</Link></header>
        {children}
      </div>
      <nav className="admin-mobile-nav">
        {items.map(({ href, label, icon: Icon }) => (
          <Link aria-current={active(pathname, href) ? "page" : undefined} key={href} href={href} className={active(pathname, href) ? "active" : ""}><Icon /><span>{label}</span></Link>
        ))}
      </nav>
    </div>
  );
}
