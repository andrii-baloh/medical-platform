import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Chrome } from "@/components/Chrome";
import { BookingClient } from "./BookingClient";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Chrome>
      <main className="content booking-page">
        <Link className="back-link-modern" href={`/doctors/${slug}`}><ArrowLeftIcon /> Вернуться к врачу</Link>
        <div className="page-heading compact-heading"><span className="eyebrow">Запись</span><h1>Выберите удобное время</h1><p>Данные сохраняются в вашем защищённом кабинете.</p></div>
        <BookingClient slug={slug} />
      </main>
    </Chrome>
  );
}
