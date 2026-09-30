"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { browserApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Patient = { id: string; fullName: string; birthDate?: string | null; sex?: string | null; appointmentCount: number; lastAppointment?: string | null; nextAppointment?: string | null };

export function DoctorPatientsClient() {
  const [items, setItems] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    browserApi<Patient[]>("/doctor/patients").then(setItems).catch(() => setError("Не удалось загрузить пациентов."));
  }, []);

  const shown = useMemo(() => items.filter((patient) => patient.fullName.toLowerCase().includes(query.toLowerCase())), [items, query]);

  return (
    <main className="doctor-content doctor-patients-v2">
      <div className="doctor-heading doctor-heading-v2"><div><span className="eyebrow">Пациенты</span><h1>Мои пациенты</h1><p>Только пациенты, у которых есть или была запись к вам.</p></div></div>

      <label className="doctor-search"><MagnifyingGlassIcon /><input placeholder="Поиск по имени" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {error && <div className="notice error">{error}</div>}

      <section className="patient-grid patient-grid-v2">
        {shown.map((patient) => <Link className="patient-card-v2" href={`/doctor/patients/${patient.id}`} key={patient.id}>
          <div className="patient-card-head"><div className="avatar">{patient.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="grow"><h3>{patient.fullName}</h3><span>{patient.appointmentCount} консультаций</span></div></div>
          <div className="patient-card-dates"><div><small>Последний приём</small><b>{formatDateTime(patient.lastAppointment)}</b></div><div><small>Следующий приём</small><b>{formatDateTime(patient.nextAppointment)}</b></div></div>
        </Link>)}
      </section>

      {!shown.length && !error && <div className="card empty-state-modern"><UserGroupIcon /><h3>Пациенты не найдены</h3><p>Измените запрос или дождитесь новых записей.</p></div>}
    </main>
  );
}
