export function formatDateTime(value?: string | null, locale = "ru-RU") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatDate(value?: string | null, locale = "ru-RU") {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0,4)), Number(value.slice(5,7))-1, Number(value.slice(8,10)))
    : new Date(value);
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export function statusLabel(status: string) {
  const labels: Record<string,string> = {
    confirmed: "Подтверждена",
    patient_checked_in: "Пациент подключился",
    in_progress: "Идёт консультация",
    completed: "Завершена",
    cancelled_by_patient: "Отменена пациентом",
    cancelled_by_doctor: "Отменена специалистом",
    no_show: "Пациент не явился",
    available: "Свободно",
    booked: "Забронировано",
    blocked: "Закрыто",
  };
  return labels[status] ?? status;
}
