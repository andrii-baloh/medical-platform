import { Chrome } from "@/components/Chrome";
import { NotificationsClient } from "./NotificationsClient";

export default function NotificationsPage() {
  return (
    <Chrome>
      <main className="content notifications-page-public">
        <div className="page-heading compact-heading"><span className="eyebrow">Центр уведомлений</span><h1>Уведомления</h1><p>Изменения по вашим консультациям и подписанным заключениям.</p></div>
        <NotificationsClient />
      </main>
    </Chrome>
  );
}
