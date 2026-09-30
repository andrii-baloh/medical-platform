import Link from "next/link";
import { ArrowRightIcon, StarIcon } from "@heroicons/react/24/solid";
import { BriefcaseIcon, LanguageIcon } from "@heroicons/react/24/outline";
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
  initials?: string;
};

function money(price: Doctor["price"]) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: price.currency, maximumFractionDigits: 0 }).format(price.amountMinor / 100);
}

export default async function DoctorsPage() {
  const doctors = await publicApi<Doctor[]>("/v1/doctors");
  return (
    <Chrome>
      <main className="content patient-catalogue">
        <div className="page-heading">
          <span className="eyebrow">Специалисты</span>
          <h1>Найдите подходящего врача</h1>
          <p>Проверенные профили, понятная стоимость и доступное время для онлайн-консультации.</p>
        </div>

        <div className="doctor-card-grid">
          {doctors.map((doctor) => (
            <Link className="doctor-card-modern" href={`/doctors/${doctor.slug}`} key={doctor.id}>
              <div className="doctor-card-top">
                <div className="doctor-avatar-modern">{doctor.initials || doctor.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                <div className="grow">
                  <span className="doctor-specialty">{doctor.specialty}</span>
                  <h2>{doctor.fullName}</h2>
                  <div className="doctor-rating"><StarIcon /> {doctor.rating.toFixed(2)} <span>{doctor.reviewCount} отзывов</span></div>
                </div>
              </div>

              <div className="doctor-meta-row">
                <span><BriefcaseIcon /> Стаж {doctor.experienceYears} лет</span>
                <span><LanguageIcon /> {doctor.languages.join(", ")}</span>
              </div>

              <div className="doctor-card-footer">
                <div><small>Консультация</small><b>{money(doctor.price)}</b></div>
                <span className="doctor-card-cta">Подробнее <ArrowRightIcon /></span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </Chrome>
  );
}
