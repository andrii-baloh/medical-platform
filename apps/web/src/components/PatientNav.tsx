"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  MagnifyingGlassIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

const items = [
  { href: "/", label: "Главная", icon: HomeIcon },
  { href: "/doctors", label: "Врачи", icon: MagnifyingGlassIcon },
  { href: "/consultations", label: "Приёмы", icon: VideoCameraIcon },
  { href: "/documents", label: "Документы", icon: DocumentTextIcon },
  { href: "/profile", label: "Профиль", icon: UserCircleIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PatientNav() {
  const pathname = usePathname();
  return (
    <>
      <nav className="patient-desktop-nav" aria-label="Основная навигация">
        {items.slice(0, 4).map(({ href, label, icon: Icon }) => (
          <Link className={isActive(pathname, href) ? "active" : ""} href={href} key={href}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <nav className="patient-mobile-nav" aria-label="Мобильная навигация">
        {items.map(({ href, label, icon: Icon }) => (
          <Link className={isActive(pathname, href) ? "active" : ""} href={href} key={href}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
