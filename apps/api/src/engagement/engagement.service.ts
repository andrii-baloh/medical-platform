import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";

type FavoriteDoctorRow = {
  id: string;
  slug: string;
  full_name: string;
  specialty: string;
  rating: string | number;
  review_count: number;
  price_minor: number;
  currency: string;
  initials: string | null;
  created_at: Date;
};

type AppointmentReviewRow = {
  id: string;
  doctor_id: string;
  patient_profile_id: string;
  status: string;
};

@Injectable()
export class EngagementService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async listFavorites(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<FavoriteDoctorRow>(
      `select d.id,d.slug,d.full_name,coalesce(s.name_ru,'Специалист') specialty,
              d.rating,d.review_count,d.price_minor,d.currency,d.initials,f.created_at
       from favorite_doctors f
       join doctor_profiles d on d.id=f.doctor_id
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties s on s.id=ds.specialty_id
       where f.user_id=$1 and d.verified=true and d.published=true
       order by f.created_at desc`,
      [user.id],
    );
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      fullName: row.full_name,
      specialty: row.specialty,
      rating: Number(row.rating),
      reviewCount: row.review_count,
      price: { amountMinor: row.price_minor, currency: row.currency },
      initials: row.initials,
      favoritedAt: row.created_at.toISOString(),
    }));
  }

  async addFavorite(principal: Principal, doctorId: string) {
    const user = await this.users.ensureAccount(principal);
    const doctor = await this.db.query<{ id: string }>(
      `select id from doctor_profiles where id=$1 and verified=true and published=true`,
      [doctorId],
    );
    if (!doctor.rows[0]) throw new NotFoundException("Doctor not found");
    await this.db.query(
      `insert into favorite_doctors(user_id,doctor_id) values ($1,$2) on conflict do nothing`,
      [user.id, doctorId],
    );
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "doctor.favorite.add", resourceType: "doctor", resourceId: doctorId });
    return { doctorId, favorite: true };
  }

  async removeFavorite(principal: Principal, doctorId: string) {
    const user = await this.users.ensureAccount(principal);
    await this.db.query(`delete from favorite_doctors where user_id=$1 and doctor_id=$2`, [user.id, doctorId]);
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "doctor.favorite.remove", resourceType: "doctor", resourceId: doctorId });
    return { doctorId, favorite: false };
  }

  async getReview(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const appointment = await this.requireOwnedAppointment(user.id, appointmentId);
    const { rows } = await this.db.query<{ rating: number; updated_at: Date }>(
      `select rating,updated_at from doctor_reviews where appointment_id=$1 and user_id=$2`,
      [appointmentId, user.id],
    );
    return {
      appointmentId,
      completed: appointment.status === "completed",
      rating: rows[0]?.rating ?? null,
      updatedAt: rows[0]?.updated_at?.toISOString() ?? null,
    };
  }

  async updateReview(principal: Principal, appointmentId: string, rating: number) {
    const user = await this.users.ensureAccount(principal);
    const result = await this.db.tx(async (client) => {
      const { rows } = await client.query<AppointmentReviewRow>(
        `select a.id,a.doctor_id,a.patient_profile_id,a.status
         from appointments a
         join patient_profiles p on p.id=a.patient_profile_id
         where a.id=$1 and p.owner_user_id=$2
         for update of a`,
        [appointmentId, user.id],
      );
      const appointment = rows[0];
      if (!appointment) throw new NotFoundException("Appointment not found");
      if (appointment.status !== "completed") throw new ConflictException("Only completed consultations can be rated");

      await client.query(`select id from doctor_profiles where id=$1 for update`, [appointment.doctor_id]);
      const saved = await client.query<{ id: string }>(
        `insert into doctor_reviews(appointment_id,doctor_id,patient_profile_id,user_id,rating)
         values ($1,$2,$3,$4,$5)
         on conflict (appointment_id) do update
           set rating=excluded.rating,updated_at=now()
         where doctor_reviews.user_id=excluded.user_id
         returning id`,
        [appointmentId, appointment.doctor_id, appointment.patient_profile_id, user.id, rating],
      );
      if (!saved.rows[0]) throw new ConflictException("Review ownership conflict");

      const aggregate = await client.query<{ rating: string; review_count: number }>(
        `select round(avg(rating)::numeric,2) rating,count(*)::int review_count
         from doctor_reviews where doctor_id=$1`,
        [appointment.doctor_id],
      );
      const summary = aggregate.rows[0];
      await client.query(
        `update doctor_profiles set rating=$2,review_count=$3,updated_at=now() where id=$1`,
        [appointment.doctor_id, summary.rating, summary.review_count],
      );
      return { doctorId: appointment.doctor_id, rating, doctorRating: Number(summary.rating), reviewCount: summary.review_count };
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "doctor.review.rate",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { rating },
    });
    return { appointmentId, ...result };
  }

  private async requireOwnedAppointment(userId: string, appointmentId: string): Promise<AppointmentReviewRow> {
    const { rows } = await this.db.query<AppointmentReviewRow>(
      `select a.id,a.doctor_id,a.patient_profile_id,a.status
       from appointments a
       join patient_profiles p on p.id=a.patient_profile_id
       where a.id=$1 and p.owner_user_id=$2`,
      [appointmentId, userId],
    );
    if (!rows[0]) throw new NotFoundException("Appointment not found");
    return rows[0];
  }
}
