import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import type { CreatePatientProfileDto, UpdatePatientProfileDto } from "./patient-profiles.dto";

@Injectable()
export class PatientProfilesService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<PatientProfileRow>(
      `select * from patient_profiles
       where owner_user_id=$1 and archived_at is null
       order by created_at`,
      [user.id],
    );
    return rows.map(mapProfile);
  }

  async create(principal: Principal, input: CreatePatientProfileDto) {
    const user = await this.users.ensureAccount(principal);
    // 'self' is reserved for the auto-created primary profile and must never be created here.
    if ((input.relationToOwner as string) === "self") {
      throw new ForbiddenException("Cannot create a dependent profile with relation 'self'");
    }
    assertBirthDateNotInFuture(input.birthDate);
    const { rows } = await this.db.query<PatientProfileRow>(
      `insert into patient_profiles(owner_user_id,full_name,birth_date,sex,relation_to_owner,country_code,legal_representative_name)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        user.id,
        input.fullName,
        input.birthDate ?? null,
        input.sex ?? null,
        input.relationToOwner,
        input.countryCode ?? null,
        input.legalRepresentativeName ?? null,
      ],
    );
    const profile = rows[0];
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "patient_profile.create",
      resourceType: "patient_profile",
      resourceId: profile.id,
      metadata: { relationToOwner: profile.relation_to_owner },
    });
    return mapProfile(profile);
  }

  async update(principal: Principal, id: string, input: UpdatePatientProfileDto) {
    const user = await this.users.ensureAccount(principal);
    // requireOwnedPatient throws NotFound when the profile is missing, archived or owned by someone else,
    // so cross-account updates never leak another user's data.
    await this.users.requireOwnedPatient(user.id, id);
    assertBirthDateNotInFuture(input.birthDate);

    const { rows } = await this.db.query<PatientProfileRow>(
      `update patient_profiles
       set full_name=coalesce($2,full_name),
           birth_date=case when $3::boolean then $4::date else birth_date end,
           sex=case when $5::boolean then $6::text else sex end,
           country_code=case when $7::boolean then $8::text else country_code end,
           legal_representative_name=case when $9::boolean then $10::text else legal_representative_name end,
           phone=case when $11::boolean then $12::text else phone end,
           updated_at=now()
       where id=$1 and owner_user_id=$13 and archived_at is null
       returning *`,
      [
        id,
        input.fullName ?? null,
        Object.prototype.hasOwnProperty.call(input, "birthDate"),
        input.birthDate ?? null,
        Object.prototype.hasOwnProperty.call(input, "sex"),
        input.sex ?? null,
        Object.prototype.hasOwnProperty.call(input, "countryCode"),
        input.countryCode ?? null,
        Object.prototype.hasOwnProperty.call(input, "legalRepresentativeName"),
        input.legalRepresentativeName ?? null,
        Object.prototype.hasOwnProperty.call(input, "phone"),
        input.phone ?? null,
        user.id,
      ],
    );
    const profile = rows[0];
    if (!profile) throw new NotFoundException("Patient profile not found");
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "patient_profile.update",
      resourceType: "patient_profile",
      resourceId: profile.id,
      metadata: { relationToOwner: profile.relation_to_owner },
    });
    return mapProfile(profile);
  }

  async archive(principal: Principal, id: string) {
    const user = await this.users.ensureAccount(principal);
    const profile = await this.users.requireOwnedPatient(user.id, id);
    if (profile.relation_to_owner === "self") {
      throw new ForbiddenException("The primary (self) profile cannot be archived");
    }
    const { rows } = await this.db.query<PatientProfileRow>(
      `update patient_profiles
       set archived_at=now(), updated_at=now()
       where id=$1 and owner_user_id=$2 and archived_at is null and relation_to_owner <> 'self'
       returning *`,
      [id, user.id],
    );
    const archived = rows[0];
    if (!archived) throw new NotFoundException("Patient profile not found");
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "patient_profile.archive",
      resourceType: "patient_profile",
      resourceId: archived.id,
      metadata: { relationToOwner: archived.relation_to_owner },
    });
    return mapProfile(archived);
  }
}

type PatientProfileRow = {
  id: string;
  owner_user_id: string;
  full_name: string;
  birth_date: Date | string | null;
  sex: string | null;
  relation_to_owner: string;
  legal_representative_name: string | null;
  country_code: string | null;
  phone: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapProfile(r: PatientProfileRow) {
  return {
    id: r.id,
    fullName: r.full_name,
    birthDate: toDateOnly(r.birth_date),
    sex: r.sex,
    relationToOwner: r.relation_to_owner,
    legalRepresentativeName: r.legal_representative_name,
    countryCode: r.country_code,
    phone: r.phone ?? null,
    archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function toDateOnly(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  // PostgreSQL DATE is a calendar value, not an instant. If a driver/parser returns a Date,
  // preserve its local calendar components instead of converting through UTC (which can shift the day).
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function assertBirthDateNotInFuture(birthDate?: string | null) {
  if (!birthDate) return;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException("Invalid birthDate");
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() > todayUtc) throw new BadRequestException("birthDate cannot be in the future");
}
