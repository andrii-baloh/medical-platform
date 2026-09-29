import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";

export type SignedResultDto = {
  appointmentId: string;
  doctor: { id: string; fullName: string; specialty: string | null };
  patient: { id: string; fullName: string };
  version: number;
  signedAt: string;
  complaints: string;
  anamnesis: string;
  assessment: string;
  recommendations: string;
  contentSha256: string;
  previousVersionSha256: string | null;
};

@Injectable()
export class PatientResultsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolve the appointment only when it belongs to the current user's
   * patient profile. Any other case is reported as 404 so an attacker cannot
   * probe for the existence of other patients' appointments.
   */
  private async requireOwnedAppointment(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select a.id, a.doctor_id, a.patient_profile_id, d.full_name doctor_name,
              p.full_name patient_name,
              coalesce(sp.name_ru, 'Специалист') specialty
       from appointments a
       join doctor_profiles d on d.id = a.doctor_id
       join patient_profiles p on p.id = a.patient_profile_id
       left join doctor_specialties ds on ds.doctor_id = d.id and ds.is_primary = true
       left join specialties sp on sp.id = ds.specialty_id
       where a.id = $1 and p.owner_user_id = $2`,
      [appointmentId, user.id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Appointment not found");
    return { user, appointment: row };
  }

  /** The patient may only ever read a signed (immutable) version. */
  private async loadVersion(appointmentId: string, versionNo?: number) {
    const params: unknown[] = [appointmentId];
    let sql = `select version_no, snapshot, content_sha256, previous_version_sha256, signed_at
               from consultation_versions where appointment_id = $1`;
    if (versionNo !== undefined) {
      params.push(versionNo);
      sql += ` and version_no = $2`;
    }
    sql += ` order by version_no desc limit 1`;
    const { rows } = await this.db.query(sql, params);
    return rows[0];
  }

  private mapResult(appointment: any, version: any): SignedResultDto {
    const snapshot = (version.snapshot ?? {}) as Record<string, unknown>;
    const asText = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      appointmentId: appointment.id,
      doctor: { id: appointment.doctor_id, fullName: appointment.doctor_name, specialty: appointment.specialty ?? null },
      patient: { id: appointment.patient_profile_id, fullName: appointment.patient_name },
      version: version.version_no,
      signedAt: new Date(version.signed_at).toISOString(),
      complaints: asText(snapshot.complaints),
      anamnesis: asText(snapshot.anamnesis),
      assessment: asText(snapshot.assessment),
      recommendations: asText(snapshot.recommendations),
      contentSha256: version.content_sha256,
      previousVersionSha256: version.previous_version_sha256 ?? null,
    };
  }

  async getLatest(principal: Principal, appointmentId: string): Promise<SignedResultDto> {
    const { user, appointment } = await this.requireOwnedAppointment(principal, appointmentId);
    const version = await this.loadVersion(appointmentId);
    if (!version) throw new NotFoundException("Signed conclusion is not available yet");
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "consultation.result.read",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { version: version.version_no, role: "patient" },
    });
    return this.mapResult(appointment, version);
  }

  async listVersions(principal: Principal, appointmentId: string): Promise<SignedResultDto[]> {
    const { user, appointment } = await this.requireOwnedAppointment(principal, appointmentId);
    const { rows } = await this.db.query(
      `select version_no, snapshot, content_sha256, previous_version_sha256, signed_at
       from consultation_versions where appointment_id = $1 order by version_no desc`,
      [appointmentId],
    );
    if (!rows.length) throw new NotFoundException("Signed conclusion is not available yet");
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "consultation.result.versions.read",
      resourceType: "appointment",
      resourceId: appointmentId,
      metadata: { role: "patient", count: rows.length },
    });
    return rows.map((r) => this.mapResult(appointment, r));
  }
}
