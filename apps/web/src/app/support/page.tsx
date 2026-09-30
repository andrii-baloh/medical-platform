import { Chrome } from "@/components/Chrome";
import { SupportClient } from "./SupportClient";

export default function SupportPage() {
  return (
    <Chrome>
      <main className="content support-page">
        <div className="page-heading compact-heading"><span className="eyebrow">Помощь</span><h1>Поддержка</h1><p>Вопросы по аккаунту, записи, оплате и работе платформы. Для медицинских вопросов используйте консультацию с врачом.</p></div>
        <SupportClient />
      </main>
    </Chrome>
  );
}
