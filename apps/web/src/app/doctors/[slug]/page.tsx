import Link from "next/link";
import { ArrowLeftIcon, CalendarDaysIcon, CheckBadgeIcon, LanguageIcon, StarIcon } from "@heroicons/react/24/outline";
import { Chrome } from "@/components/Chrome";
import { publicApi } from "@/lib/api";

type Doctor = {
  id: string;
  slug: string;
  fullName: string;
  specialty: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  price: { amountMinor: number; currency: string };
  languages: string[];
  patientGroups: string[];
  about?: string;
  initials?: string;
};

export default async function DoctorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doctor = await publicApi<Doctor>(`/v1/doctors/${slug}`);
  const price = new Intl.NumberFormat("ru-RU", { style: "currency", currency: doctor.price.currency, maximumFractionDigits: 0 }).format(doctor.price.amountMinor / 100);

  return (
    <Chrome>
      <main className="content doctor-profile-public">
        <Link className="back-link-modern" href="/doctors"><ArrowLeftIcon /> Все специалисты</Link>

        <section className="doctor-profile-hero">
          <div className="doctor-profile-main">
            <div className="doctor-avatar-large">{doctor.initials || doctor.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
            <div>
              <span className="doctor-specialty">{doctor.specialty}</span>
              <h1>{doctor.fullName}</h1>
              <div className="doctor-rating"><StarIcon /> {doctor.rating.toFixed(2)} <span>{doctor.reviewCount} отзывов</span></div>
              <div className="profile-chip-row">
                <span><CheckBadgeIcon /> Стаж {doctor.experienceYears} лет</span>
                <span><LanguageIcon /> {doctor.languages.join(", ")}</span>
              </div>
            </div>
          </div>

          <aside className="doctor-booking-card">
            <small>Онлайн-консультация</small>
            <strong>{price}</strong>
            <p>Выберите удобное свободное время в календаре врача.</p>
            <Link className="btn primary" href={`/book/${doctor.slug}`}><CalendarDaysIcon /> Выбрать время</Link>
          </aside>
        </section>

        <section className="doctor-profile-grid">
          <article className="card doctor-about-card">
            <span className="eyebrow">О специалисте</span>
            <h2>Опыт и подход</h2>
            <p>{doctor.about || "Информация о специалисте будет добавлена позже."}</p>
          </article>
          <article className="card doctor-about-card">
            <span className="eyebrow">Принимает</span>
            <h2>Группы пациентов</h2>
            <div className="profile-chip-row">
              {doctor.patientGroups.map((group) => <span key={group}>{group}</span>)}
            </div>
          </article>
        </section>
      </main>
    </Chrome>
  );
}
