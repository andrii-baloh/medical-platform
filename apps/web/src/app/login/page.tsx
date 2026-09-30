import { LockClosedIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand brand-large"><span className="mark">M</span><span><b>MediCare</b><small>онлайн-консультации</small></span></div>
        <div className="login-icon"><LockClosedIcon /></div>
        <span className="eyebrow">Защищённый аккаунт</span>
        <h1>Вход в MediCare</h1>
        <p>Авторизация выполняется через отдельный OIDC-сервис. Пароли не хранятся в базе приложения.</p>
        <form action={async () => { "use server"; await signIn("keycloak", { redirectTo: "/profile" }); }}>
          <button className="btn primary">Войти или зарегистрироваться</button>
        </form>
        <div className="login-security"><ShieldCheckIcon /> Защищённое соединение и контроль доступа к медицинским данным</div>
      </section>
    </main>
  );
}
