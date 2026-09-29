import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import type { Principal } from "../auth/principal";

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  async ensureAccount(principal: Principal) {
    const country = (process.env.DEPLOYMENT_COUNTRY ?? "XX").toUpperCase();
    const locale = process.env.DEFAULT_LOCALE ?? "ru";
    const timezone = process.env.DEFAULT_TIMEZONE ?? "UTC";
    const row = await this.db.tx(async (client) => {
      const { rows } = await client.query(
        `insert into app_users(identity_subject,email,full_name,locale,timezone,country_code)
         values ($1,$2,$3,$4,$5,nullif($6,'XX'))
         on conflict (identity_subject) do update
           set email=coalesce(excluded.email,app_users.email),
               full_name=coalesce(excluded.full_name,app_users.full_name),
               updated_at=now()
         returning *`,
        [principal.sub, principal.email ?? null, principal.name ?? null, locale, timezone, country],
      );
      const user = rows[0];
      const trustedRoles = new Set(["patient", "doctor", "admin"]);
      const roles = new Set<string>(["patient"]);
      for (const role of principal.roles ?? []) if (trustedRoles.has(role)) roles.add(role);
      // Elevated roles mirror the currently verified OIDC token so role revocation is effective.
      await client.query(`delete from user_roles where user_id=$1 and role in ('doctor','admin')`, [user.id]);
      for (const role of roles) {
        await client.query(
          `insert into user_roles(user_id,role) values ($1,$2) on conflict do nothing`,
          [user.id, role],
        );
      }
      const existing = await client.query(
        `select id from patient_profiles where owner_user_id=$1 and relation_to_owner='self' and archived_at is null limit 1`,
        [user.id],
      );
      if (!existing.rowCount) {
        await client.query(
          `insert into patient_profiles(owner_user_id,full_name,relation_to_owner,country_code)
           values ($1,$2,'self',nullif($3,'XX'))`,
          [user.id, user.full_name || user.email || "Пациент", country],
        );
      }
      return user;
    });
    return row;
  }

  async getMe(principal: Principal) {
    const user = await this.ensureAccount(principal);
    const { rows: patients } = await this.db.query(
      `select id,full_name,birth_date,relation_to_owner
       from patient_profiles where owner_user_id=$1 and archived_at is null order by created_at`,
      [user.id],
    );
    const { rows: roles } = await this.db.query(`select role from user_roles where user_id=$1`, [user.id]);
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      locale: user.locale,
      timezone: user.timezone,
      countryCode: user.country_code,
      roles: roles.map((r) => r.role),
      patientProfiles: patients.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        birthDate: p.birth_date,
        relationToOwner: p.relation_to_owner,
      })),
    };
  }

  async requireOwnedPatient(userId: string, patientProfileId: string) {
    const { rows } = await this.db.query(
      `select * from patient_profiles where id=$1 and owner_user_id=$2 and archived_at is null`,
      [patientProfileId, userId],
    );
    if (!rows[0]) throw new NotFoundException("Patient profile not found");
    return rows[0];
  }
}
