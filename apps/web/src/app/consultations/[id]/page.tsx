import { Chrome } from "@/components/Chrome";
import { ConsultationDetailClient } from "./ConsultationDetailClient";

export default async function ConsultationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Chrome>
      <main className="content">
        <ConsultationDetailClient appointmentId={id} />
      </main>
    </Chrome>
  );
}
