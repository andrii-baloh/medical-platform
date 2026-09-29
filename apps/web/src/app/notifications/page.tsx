import { Chrome } from "@/components/Chrome";
import { NotificationsClient } from "./NotificationsClient";

export default function NotificationsPage() {
  return (
    <Chrome>
      <main className="content">
        <NotificationsClient />
      </main>
    </Chrome>
  );
}
