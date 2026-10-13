import { Chrome } from "@/components/Chrome";
import { ConsultationsClient } from "./ConsultationsClient";

export default function ConsultationsPage() {
  return (
    <Chrome>
      <main className="content consultations-page-public">
        <div className="page-heading compact-heading"><span className="eyebrow">Мои приёмы</span><h1>Консультации</h1><p>Предстоящие встречи, история приёмов и подписанные заключения.</p></div>
        <ConsultationsClient />
      </main>
    </Chrome>
  );
}
