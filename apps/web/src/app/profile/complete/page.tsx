import "react-phone-number-input/style.css";
import { Chrome } from "@/components/Chrome";
import { CompleteProfileClient } from "./CompleteProfileClient";

export default function CompleteProfilePage() {
  return (
    <Chrome>
      <main className="content profile-page-public">
        <div className="page-heading compact-heading">
          <span className="eyebrow">Аккаунт</span>
          <h1>Заполните профиль</h1>
          <p>Укажите дату рождения и телефон, чтобы пользоваться кабинетом.</p>
        </div>
        <CompleteProfileClient />
      </main>
    </Chrome>
  );
}
