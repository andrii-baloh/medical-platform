import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

@Injectable()
export class DoctorsService {
  constructor(private readonly db: DbService) {}

  async list() {
    const { rows } = await this.db.query(
      `select d.id,d.slug,d.full_name,d.about,d.experience_years,d.languages,d.patient_groups,
              d.rating,d.review_count,d.price_minor,d.currency,d.initials,
              coalesce(s.name_ru,'Специалист') as specialty
       from doctor_profiles d
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties s on s.id=ds.specialty_id
       where d.verified=true and d.published=true
       order by d.rating desc,d.review_count desc`,
    );
    return rows.map(mapDoctor);
  }

  async getBySlug(slug: string) {
    const { rows } = await this.db.query(
      `select d.id,d.slug,d.full_name,d.about,d.experience_years,d.languages,d.patient_groups,
              d.rating,d.review_count,d.price_minor,d.currency,d.initials,
              coalesce(s.name_ru,'Специалист') as specialty
       from doctor_profiles d
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties s on s.id=ds.specialty_id
       where d.slug=$1 and d.verified=true and d.published=true`,
      [slug],
    );
    if (!rows[0]) throw new NotFoundException("Doctor not found");
    return mapDoctor(rows[0]);
  }

  async slots(doctorId: string) {
    const { rows } = await this.db.query(
      `select id,doctor_id,starts_at,ends_at,price_minor,currency
       from appointment_slots
       where doctor_id=$1 and status='available' and starts_at>now()
       order by starts_at limit 80`,
      [doctorId],
    );
    return rows.map((r) => ({
      id: r.id,
      doctorId: r.doctor_id,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      price: { amountMinor: r.price_minor, currency: r.currency },
    }));
  }
}

function mapDoctor(r: any) {
  return {
    id: r.id,
    slug: r.slug,
    fullName: r.full_name,
    specialty: r.specialty,
    experienceYears: r.experience_years,
    rating: Number(r.rating),
    reviewCount: r.review_count,
    price: { amountMinor: r.price_minor, currency: r.currency },
    languages: r.languages ?? [],
    patientGroups: r.patient_groups ?? [],
    about: r.about,
    initials: r.initials,
  };
}
