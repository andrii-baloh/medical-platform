import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type {
  AlertStatusDto,
  CreateEnrollmentDto,
  CreateMeasurementDto,
  CreateProgramDto,
  CreateReviewDto,
  CreateThresholdDto,
} from "./monitoring.dto";

type EnrollmentRow = {
  id: string;
  program_id: string;
  patient_profile_id: string;
  doctor_id: string;
  status: string;
  enrolled_at: Date;
  ended_at: Date | null;
  notes: string | null;
  doctor_user_id: string | null;
  patient_owner_user_id: string;
};

const SEVERITY_RANK: Record<string, number> = { info: 1, warning: 2, critical: 3 };

@Injectable()
export class MonitoringService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireDoctor(principal: Principal) {
    if (!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role is required");
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<{ id: string; verified: boolean; organization_id: string | null }>(
      `select d.id,d.verified,
              (select m.organization_id
               from doctor_organization_memberships m
               where m.doctor_id=d.id and m.active=true
                 and (m.starts_at is null or m.starts_at<=current_date)
                 and (m.ends_at is null or m.ends_at>=current_date)
               order by m.is_primary desc,m.created_at desc limit 1) organization_id
       from doctor_profiles d
       join user_roles r on r.user_id=$1 and r.role='doctor'
       where d.account_user_id=$1`,
      [user.id],
    );
    const doctor = rows[0];
    if (!doctor) throw new ForbiddenException("Doctor profile is required");
    if (!doctor.verified) throw new ForbiddenException("Doctor profile must be verified");
    return { user, doctor };
  }

  /** Doctor or patient owner of the enrollment, with the role resolved from the database. */
  private async requireEnrollment(principal: Principal, enrollmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<EnrollmentRow>(
      `select e.id,e.program_id,e.patient_profile_id,e.doctor_id,e.status,e.enrolled_at,e.ended_at,e.notes,
              d.account_user_id doctor_user_id,p.owner_user_id patient_owner_user_id
       from patient_monitoring_enrollments e
       join doctor_profiles d on d.id=e.doctor_id
       join patient_profiles p on p.id=e.patient_profile_id
       where e.id=$1`,
      [enrollmentId],
    );
    const enrollment = rows[0];
    if (!enrollment) throw new NotFoundException("Monitoring enrollment not found");
    const isDoctor = enrollment.doctor_user_id === user.id;
    const isPatient = enrollment.patient_owner_user_id === user.id;
    if (!isDoctor && !isPatient) throw new ForbiddenException("Not a participant of this monitoring enrollment");
    if (isDoctor) {
      if (!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role is required");
      const { rows: roles } = await this.db.query(
        "select 1 from user_roles where user_id=$1 and role='doctor'",
        [user.id],
      );
      if (!roles.length) throw new ForbiddenException("Doctor role has been revoked");
    }
    return { user, enrollment, role: (isDoctor ? "doctor" : "patient") as "doctor" | "patient" };
  }

  private async requireDoctorEnrollment(principal: Principal, enrollmentId: string) {
    const context = await this.requireEnrollment(principal, enrollmentId);
    if (context.role !== "doctor") throw new ForbiddenException("Only the treating doctor can perform this action");
    return context;
  }

  async createProgram(principal: Principal, input: CreateProgramDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query<{ id: string }>(
      `insert into monitoring_programs(organization_id,title,description,condition,created_by_user_id)
       values ($1,$2,$3,$4,$5) returning id`,
      [doctor.organization_id, input.title, input.description ?? null, input.condition ?? null, user.id],
    );
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "monitoring.program.create",
      resourceType: "monitoring_program",
      resourceId: rows[0].id,
    });
    return { id: rows[0].id };
  }

  async listPrograms(principal: Principal) {
    await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select id,title,description,condition,active,created_at
       from monitoring_programs where active=true order by title`,
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      condition: row.condition,
      active: row.active,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async createEnrollment(principal: Principal, input: CreateEnrollmentDto) {
    const { user, doctor } = await this.requireDoctor(principal);
    const program = await this.db.query<{ id: string }>(
      `select id from monitoring_programs where id=$1 and active=true`,
      [input.programId],
    );
    if (!program.rows[0]) throw new NotFoundException("Monitoring program not found");

    // A doctor may enroll only a patient they actually treat.
    const relation = await this.db.query<{ ok: number }>(
      `select 1 ok where exists(
         select 1 from appointments a where a.doctor_id=$1 and a.patient_profile_id=$2
       ) or exists(
         select 1 from medical_encounters e where e.doctor_id=$1 and e.patient_profile_id=$2
       )`,
      [doctor.id, input.patientProfileId],
    );
    if (!relation.rows[0]) throw new ForbiddenException("Patient is not in this doctor's care");

    try {
      const { rows } = await this.db.query<{ id: string }>(
        `insert into patient_monitoring_enrollments(program_id,patient_profile_id,doctor_id,notes,created_by_user_id)
         values ($1,$2,$3,$4,$5) returning id`,
        [input.programId, input.patientProfileId, doctor.id, input.notes ?? null, user.id],
      );
      await this.audit.record({
        actorUserId: user.id,
        actorSubject: principal.sub,
        action: "monitoring.enrollment.create",
        resourceType: "patient_monitoring_enrollment",
        resourceId: rows[0].id,
        metadata: { programId: input.programId },
      });
      return { id: rows[0].id };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException("Patient is already enrolled in this program");
      }
      throw error;
    }
  }

  async listEnrollments(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select e.id,e.program_id,p.title program_title,e.status,e.enrolled_at,e.ended_at,
              pp.full_name patient_name
       from patient_monitoring_enrollments e
       join monitoring_programs p on p.id=e.program_id
       join patient_profiles pp on pp.id=e.patient_profile_id
       join doctor_profiles d on d.id=e.doctor_id
       where d.account_user_id=$1 or pp.owner_user_id=$1
       order by e.created_at desc limit 100`,
      [user.id],
    );
    return rows.map((row) => ({
      id: row.id,
      programId: row.program_id,
      programTitle: row.program_title,
      status: row.status,
      enrolledAt: new Date(row.enrolled_at).toISOString(),
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      patientName: row.patient_name,
    }));
  }

  async createMeasurement(principal: Principal, input: CreateMeasurementDto) {
    const enrollmentId = input.enrollmentId;
    if (!enrollmentId) throw new UnprocessableEntityException("enrollmentId is required");
    const { user, enrollment, role } = await this.requireEnrollment(principal, enrollmentId);
    if (enrollment.status !== "active") throw new ConflictException("Enrollment is not active");
    if (!Number.isFinite(input.value)) throw new UnprocessableEntityException("Measurement value is invalid");

    const result = await this.db.tx(async (client) => {
      // Lock enrollment to prevent accepting measurements after a concurrent
      // pause/cancellation. The owner check above controls data access.
      const { rows: active } = await client.query<{ id: string }>(
        "select id from patient_monitoring_enrollments where id=$1 and status='active' for update",
        [enrollmentId],
      );
      if (!active.length) throw new ConflictException("Enrollment is not active");
      if (input.deviceId) {
        const { rows: device } = await client.query<{ id: string }>(
          "select id from medical_devices where id=$1 and patient_profile_id=$2 and active=true",
          [input.deviceId, enrollment.patient_profile_id],
        );
        if (!device.length) throw new ForbiddenException("Device does not belong to this patient or is inactive");
      }
      const inserted = await client.query<{ id: string }>(
        `insert into measurements(enrollment_id,device_id,metric,value,unit,measured_at,source,recorded_by_user_id)
         values ($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()),'manual',$7) returning id`,
        [enrollmentId, input.deviceId ?? null, input.metric, input.value, input.unit ?? null, input.measuredAt ?? null, user.id],
      );

      // Threshold evaluation happens at ingest time so an out-of-range value can
      // never be stored without a corresponding alert.
      const thresholds = await client.query<{ id: string; severity: string; min_value: string | null; max_value: string | null }>(
        `select id,severity,min_value,max_value from measurement_thresholds
         where program_id=$1 and metric=$2 and active=true`,
        [enrollment.program_id, input.metric],
      );
      let highest: string | null = null;
      for (const threshold of thresholds.rows) {
        const min = threshold.min_value === null ? null : Number(threshold.min_value);
        const max = threshold.max_value === null ? null : Number(threshold.max_value);
        const violated = (min !== null && input.value < min) || (max !== null && input.value > max);
        if (!violated) continue;
        highest = !highest || (SEVERITY_RANK[threshold.severity] ?? 0) > (SEVERITY_RANK[highest] ?? 0)
          ? threshold.severity
          : highest;
        await client.query(
          `insert into clinical_alerts(enrollment_id,measurement_id,threshold_id,severity,message)
           values ($1,$2,$3,$4,$5)`,
          [
            enrollmentId,
            inserted.rows[0].id,
            threshold.id,
            threshold.severity,
            `Measurement ${input.metric} is out of the configured range`,
          ],
        );
      }
      return { measurementId: inserted.rows[0].id, alertSeverity: highest };
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "monitoring.measurement.create",
      resourceType: "monitoring_measurement",
      resourceId: result.measurementId,
      metadata: { enrollmentId: enrollmentId, metric: input.metric, role, alert: Boolean(result.alertSeverity) },
    });
    return result;
  }

  async listMeasurements(principal: Principal, enrollmentId: string, limit = 100) {
    await this.requireEnrollment(principal, enrollmentId);
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 100, 1), 500);
    const { rows } = await this.db.query(
      `select id,metric,value,unit,measured_at,source,created_at
       from measurements where enrollment_id=$1 order by measured_at desc limit $2`,
      [enrollmentId, take],
    );
    return rows.map((row) => ({
      id: row.id,
      metric: row.metric,
      value: Number(row.value),
      unit: row.unit,
      measuredAt: new Date(row.measured_at).toISOString(),
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async createThreshold(principal: Principal, programId: string, input: CreateThresholdDto) {
    const { user } = await this.requireDoctor(principal);
    if (input.minValue === undefined && input.maxValue === undefined) {
      throw new UnprocessableEntityException("A threshold requires minValue or maxValue");
    }
    if (input.minValue !== undefined && input.maxValue !== undefined && input.minValue >= input.maxValue) {
      throw new UnprocessableEntityException("minValue must be lower than maxValue");
    }
    const program = await this.db.query<{ id: string; created_by_user_id: string; active: boolean }>(
      `select id,created_by_user_id,active from monitoring_programs where id=$1`, [programId],
    );
    if (!program.rows[0]) throw new NotFoundException("Monitoring program not found");
    if (!program.rows[0].active || program.rows[0].created_by_user_id !== user.id)
      throw new ForbiddenException("Only the active program owner can configure thresholds");

    const { rows } = await this.db.query<{ id: string }>(
      `insert into measurement_thresholds(program_id,metric,min_value,max_value,severity)
       values ($1,$2,$3,$4,coalesce($5,'warning')) returning id`,
      [programId, input.metric, input.minValue ?? null, input.maxValue ?? null, input.severity ?? null],
    );
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "monitoring.threshold.create",
      resourceType: "measurement_threshold",
      resourceId: rows[0].id,
      metadata: { programId, metric: input.metric },
    });
    return { id: rows[0].id };
  }

  async listThresholds(principal: Principal, programId: string) {
    await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select id,metric,min_value,max_value,severity,active from measurement_thresholds
       where program_id=$1 order by metric,created_at desc`,
      [programId],
    );
    return rows.map((row) => ({
      id: row.id,
      metric: row.metric,
      minValue: row.min_value === null ? null : Number(row.min_value),
      maxValue: row.max_value === null ? null : Number(row.max_value),
      severity: row.severity,
      active: row.active,
    }));
  }

  async listAlerts(principal: Principal, status = "open") {
    const { user } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `select a.id,a.enrollment_id,a.severity,a.status,a.message,a.created_at,
              m.metric,m.value,m.measured_at,pp.full_name patient_name
       from clinical_alerts a
       join patient_monitoring_enrollments e on e.id=a.enrollment_id
       join patient_profiles pp on pp.id=e.patient_profile_id
       left join measurements m on m.id=a.measurement_id
       where e.doctor_id in (select id from doctor_profiles where account_user_id=$1)
         and ($2::text is null or a.status=$2)
       order by a.created_at desc limit 200`,
      [user.id, status || null],
    );
    return rows.map((row) => ({
      id: row.id,
      enrollmentId: row.enrollment_id,
      severity: row.severity,
      status: row.status,
      message: row.message,
      metric: row.metric,
      value: row.value === null ? null : Number(row.value),
      measuredAt: row.measured_at ? new Date(row.measured_at).toISOString() : null,
      patientName: row.patient_name,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async updateAlert(principal: Principal, alertId: string, input: AlertStatusDto) {
    const { user } = await this.requireDoctor(principal);
    const alert = await this.db.query<{ enrollment_id: string; status: string }>(
      `select a.enrollment_id,a.status
       from clinical_alerts a
       join patient_monitoring_enrollments e on e.id=a.enrollment_id
       join doctor_profiles d on d.id=e.doctor_id
       where a.id=$1 and d.account_user_id=$2`,
      [alertId, user.id],
    );
    if (!alert.rows[0]) throw new NotFoundException("Alert not found");

    await this.db.query(
      `update clinical_alerts
       set status=$2,
           acknowledged_by_user_id=case when $2='acknowledged' then $3 else acknowledged_by_user_id end,
           acknowledged_at=case when $2='acknowledged' then coalesce(acknowledged_at,now()) else acknowledged_at end,
           resolved_at=case when $2='resolved' then now() else resolved_at end,
           resolution_note=coalesce($4,resolution_note)
       where id=$1`,
      [alertId, input.status, user.id, input.note ?? null],
    );
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "monitoring.alert.update",
      resourceType: "clinical_alert",
      resourceId: alertId,
      metadata: { status: input.status },
    });
    return { ok: true };
  }

  async createReview(principal: Principal, enrollmentId: string, input: CreateReviewDto) {
    const { user } = await this.requireDoctorEnrollment(principal, enrollmentId);
    const { rows } = await this.db.query<{ id: string }>(
      `insert into monitoring_reviews(enrollment_id,reviewer_user_id,period_start,period_end,summary,action)
       values ($1,$2,$3::timestamptz,$4::timestamptz,$5,$6) returning id`,
      [enrollmentId, user.id, input.periodStart ?? null, input.periodEnd ?? null, input.summary, input.action ?? null],
    );
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "monitoring.review.create",
      resourceType: "monitoring_review",
      resourceId: rows[0].id,
      metadata: { enrollmentId },
    });
    return { id: rows[0].id };
  }

  async listReviews(principal: Principal, enrollmentId: string) {
    await this.requireEnrollment(principal, enrollmentId);
    const { rows } = await this.db.query(
      `select id,period_start,period_end,summary,action,created_at,reviewer_user_id
       from monitoring_reviews where enrollment_id=$1 order by created_at desc limit 50`,
      [enrollmentId],
    );
    return rows.map((row) => ({
      id: row.id,
      periodStart: row.period_start ? new Date(row.period_start).toISOString() : null,
      periodEnd: row.period_end ? new Date(row.period_end).toISOString() : null,
      summary: row.summary,
      action: row.action,
      createdAt: new Date(row.created_at).toISOString(),
      reviewerUserId: row.reviewer_user_id,
    }));
  }
}
