import Link from "next/link";
import {
  ArrowRightIcon,
  ClockIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserGroupIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Chrome } from "@/components/Chrome";

const actions = [
  { href: "/doctors", title: "Найти врача", text: "Выберите специалиста по профилю и свободному времени", icon: UserGroupIcon, tone: "violet" },
  { href: "/consultations", title: "Мои приёмы", text: "Предстоящие консультации и подписанные заключения", icon: VideoCameraIcon, tone: "mint" },
  { href: "/documents", title: "Документы", text: "Храните медицинские файлы в приватном хранилище", icon: DocumentTextIcon, tone: "blue" },
] as const;

export default function Home() {
  return (
    <Chrome>
      <main className="content patient-home">
        <section className="home-hero">
          <div className="home-hero-copy">
            <div className="hero-kicker"><SparklesIcon /> Медицинская помощь онлайн</div>
            <h1>Консультация врача без очередей и лишних поездок</h1>
            <p>Выберите специалиста, запишитесь на удобное время и получите консультацию в защищённом видеочате.</p>
            <div className="hero-actions">
              <Link className="btn primary hero-primary" href="/doctors">Найти специалиста <ArrowRightIcon /></Link>
              <Link className="btn hero-secondary" href="/consultations">Мои консультации</Link>
            </div>
            <div className="hero-trust-row">
              <span><ShieldCheckIcon /> Приватные данные</span>
              <span><ClockIcon /> Запись 24/7</span>
              <span><VideoCameraIcon /> Видео внутри платформы</span>
            </div>
          </div>
          <div className="home-hero-panel">
            <div className="hero-panel-icon"><VideoCameraIcon /></div>
            <strong>Всё в одном месте</strong>
            <span>Запись, видеоприём, документы и заключение врача — в одном защищённом кабинете.</span>
          </div>
        </section>

        <section className="patient-section">
          <div className="section-head">
            <div><span className="eyebrow">Быстрый доступ</span><h2>Что нужно сделать?</h2></div>
          </div>
          <div className="patient-action-grid">
            {actions.map(({ href, title, text, icon: Icon, tone }) => (
              <Link href={href} className={`patient-action-card ${tone}`} key={href}>
                <span className="patient-action-icon"><Icon /></span>
                <div><h3>{title}</h3><p>{text}</p></div>
                <ArrowRightIcon className="patient-action-arrow" />
              </Link>
            ))}
          </div>
        </section>

        <section className="patient-section trust-section">
          <div className="trust-card"><ShieldCheckIcon /><div><b>Контроль доступа</b><span>Документы доступны только вам и тем врачам, которым вы сами дали доступ.</span></div></div>
          <div className="trust-card"><VideoCameraIcon /><div><b>Видеоконсультация</b><span>Подключение к приёму прямо из личного кабинета без сторонних ссылок.</span></div></div>
          <div className="trust-card"><DocumentTextIcon /><div><b>Заключение после приёма</b><span>Пациент видит только подписанную врачом версию заключения.</span></div></div>
        </section>
      </main>
    </Chrome>
  );
}
