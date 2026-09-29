import Link from "next/link";
import { auth } from "@/auth";

export async function Chrome({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return <div className="shell">
    <header className="topbar"><Link className="brand" href="/"><span className="mark">M</span><span>MediCare</span></Link><Link className="chip" href={session ? "/profile" : "/login"}>{session ? "Профиль" : "Войти"}</Link></header>
    {children}
    <nav className="nav">
      <Link href="/"><strong>⌂</strong>Главная</Link>
      <Link href="/doctors"><strong>⌕</strong>Врачи</Link>
      <Link href="/consultations"><strong>▣</strong>Приёмы</Link>
      <Link href="/documents"><strong>▤</strong>Файлы</Link>
      <Link href="/profile"><strong>◉</strong>Профиль</Link>
    </nav>
  </div>
}
