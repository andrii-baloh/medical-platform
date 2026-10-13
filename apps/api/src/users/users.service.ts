import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import type { Principal } from "../auth/principal";

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  async ensureAccount(principal: Principal) {
    const country = (process.env.DEPLOYMENT_COUNTRY ?? "XX").toUpperCase();
    const locale = process.env.DEFAULT_LOCALE ?? "ru";
    const timezone = process.env.DEFAULT_TIMEZONE ?? "UTC";
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        `insert into app_users(identity_subject,email,full_name,locale,timezone,country_code)
         values ($1,$2,$3,$4,$5,nullif($6,'XX'))
         on conflict (identity_subject) do update
           set email=coalesce(excluded.email,app_users.email),full_name=coalesce(excluded.full_name,app_users.full_name),updated_at=now()
         returning *`,
        [principal.sub, principal.email ?? null, principal.name ?? null, locale, timezone, country],
      );
      const user = rows[0];
      const trustedRoles = new Set(["patient", "doctor", "admin"]);
      const roles = new Set<string>(["patient"]);
      for (const role of principal.roles ?? []) if (trustedRoles.has(role)) roles.add(role);
      await client.query(`delete from user_roles where user_id=$1 and role in ('doctor','admin')`, [user.id]);
      for (const role of roles) await client.query(`insert into user_roles(user_id,role) values ($1,$2) on conflict do nothing`, [user.id, role]);

      const existing = await client.query(`select id from patient_profiles where owner_user_id=$1 and relation_to_owner='self' and archived_at is null limit 1`, [user.id]);
      if (!existing.rowCount) {
        await client.query(`insert into patient_profiles(owner_user_id,full_name,relation_to_owner,country_code) values ($1,$2,'self',nullif($3,'XX'))`, [user.id, user.full_name || user.email || "Пациент", country]);
      }

      if (principal.esiaId) {
        const sameSubject = await client.query(`select id,user_id,status from federated_identities where provider='esia' and provider_subject=$1 for update`, [principal.esiaId]);
        if (sameSubject.rows[0] && sameSubject.rows[0].user_id !== user.id) throw new ConflictException("Federated identity conflict");
        const sameUser = await client.query(`select id,provider_subject,status from federated_identities where user_id=$1 and provider='esia' and status<>'revoked' for update`, [user.id]);
        if (sameUser.rows[0] && sameUser.rows[0].provider_subject !== principal.esiaId) throw new ConflictException("Federated identity conflict");

        const targetStatus = principal.esiaVerified ? "verified" : "linked";
        const linked = await client.query(
          `insert into federated_identities(user_id,provider,provider_subject,status,verified_at,last_seen_at)
           values($1,'esia',$2,$3,case when $3='verified' then now() end,now())
           on conflict(provider,provider_subject) do update set last_seen_at=now(),
             status=case when excluded.status='verified' then 'verified' else federated_identities.status end,
             verified_at=case when excluded.status='verified' then coalesce(federated_identities.verified_at,now()) else federated_identities.verified_at end
           returning id,status`,
          [user.id, principal.esiaId, targetStatus],
        );
        const identity = linked.rows[0];
        const sessionKey = principal.sessionId ?? (principal.authTime ? `${principal.sub}:${principal.authTime}` : undefined);
        if (sessionKey) {
          await client.query(
            `insert into federated_auth_events(user_id,provider,provider_subject,session_key,event_type,identity_verified,auth_time)
             values($1,'esia',$2,$3,'login_success',$4,case when $5::bigint is null then null else to_timestamp($5::bigint) end)
             on conflict do nothing`,
            [user.id, principal.esiaId, sessionKey, Boolean(principal.esiaVerified), principal.authTime ?? null],
          );
        }
        if (identity.status === "verified") {
          const selfProfile = await client.query(`select id from patient_profiles where owner_user_id=$1 and relation_to_owner='self' and archived_at is null limit 1`, [user.id]);
          if (selfProfile.rows[0]) {
            await client.query(
              `insert into patient_identity_matches(patient_profile_id,federated_identity_id,status,match_basis,verified_by_user_id,verified_at)
               values($1,$2,'verified','account_owner',$3,now())
               on conflict(patient_profile_id,federated_identity_id) do update set status='verified',match_basis='account_owner',verified_by_user_id=excluded.verified_by_user_id,verified_at=coalesce(patient_identity_matches.verified_at,now()),updated_at=now()`,
              [selfProfile.rows[0].id, identity.id, user.id],
            );
          }
        }
      }
      return user;
    });
  }

  async getMe(principal: Principal) {
    const user = await this.ensureAccount(principal);
    const { rows: patients } = await this.db.query(`select id,full_name,birth_date,relation_to_owner from patient_profiles where owner_user_id=$1 and archived_at is null order by created_at`, [user.id]);
    const { rows: roles } = await this.db.query(`select role from user_roles where user_id=$1`, [user.id]);
    return { id:user.id,email:user.email,fullName:user.full_name,locale:user.locale,timezone:user.timezone,countryCode:user.country_code,roles:roles.map((r)=>r.role),patientProfiles:patients.map((p)=>({id:p.id,fullName:p.full_name,birthDate:p.birth_date,relationToOwner:p.relation_to_owner})) };
  }

  async requireOwnedPatient(userId: string, patientProfileId: string) {
    const { rows } = await this.db.query(`select * from patient_profiles where id=$1 and owner_user_id=$2 and archived_at is null`, [patientProfileId, userId]);
    if (!rows[0]) throw new NotFoundException("Patient profile not found");
    return rows[0];
  }
}
