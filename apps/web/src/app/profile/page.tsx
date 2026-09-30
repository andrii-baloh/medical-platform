import { Chrome } from "@/components/Chrome";
import { ProfileClient } from "./ProfileClient";

export default function ProfilePage() {
  return (
    <Chrome>
      <main className="content profile-page-public">
        <div className="page-heading compact-heading"><span className="eyebrow">Аккаунт</span><h1>Мой профиль</h1><p>Личные данные, профили семьи и настройки кабинета.</p></div>
        <ProfileClient />
      </main>
    </Chrome>
  );
}
