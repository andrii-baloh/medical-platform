import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type { AttachDocumentDto, ChatMessageDto } from "./consultation-material.dto";

type EncounterContext = {
  encounter_id: string;
  appointment_id: string;
  encounter_status: string;
  appointment_status: string;
  patient_owner_user_id: string;
  doctor_user_id: string | null;
  doctor_verified: boolean;
};

type MaterialRow = {
  id: string;
  encounter_id: string;
  appointment_id: string;
  author_user_id: string;
  author_role: string;
  material_type: string;
  document_id: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  document_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
};

/** Encounter states in which the consultation is still writable. */
const WRITABLE_ENCOUNTER_STATUSES = ["scheduled", "waiting", "active"];
const READ_ONLY_APPOINTMENT_STATUSES = ["cancelled_by_patient", "cancelled_by_doctor", "no_show"];

@Injectable()
export class ConsultationMaterialsService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireParticipant(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    const appointment = await this.db.query<{ id: string }>(`select id from appointments where id=$1`, [appointmentId]);
    if (!appointment.rows[0]) throw new NotFoundException("Appointment not found");

    const { rows } = await this.db.query<EncounterContext>(
      `select e.id encounter_id,e.appointment_id,e.status encounter_status,a.status appointment_status,
              p.owner_user_id patient_owner_user_id,
              d.account_user_id doctor_user_id,d.verified doctor_verified
       from medical_encounters e
       join appointments a on a.id=e.appointment_id
       join patient_profiles p on p.id=e.patient_profile_id
       join doctor_profiles d on d.id=e.doctor_id
       where e.appointment_id=$1`,
      [appointmentId],
    );
    const encounter = rows[0];
    if (!encounter) {
      throw new ConflictException("Consultation chat is available after the medical encounter is created");
    }

    const isDoctor = Boolean(encounter.doctor_user_id) && encounter.doctor_user_id === user.id && encounter.doctor_verified;
    const isPatient = encounter.patient_owner_user_id === user.id;
    if (!isDoctor && !isPatient) throw new ForbiddenException("Not a participant of this consultation");

    return { user, encounter, role: (isDoctor ? "doctor" : "patient") as "doctor" | "patient" };
  }

  private assertWritable(encounter: EncounterContext) {
    if (!WRITABLE_ENCOUNTER_STATUSES.includes(encounter.encounter_status)) {
      throw new ConflictException("Consultation is read-only after it is completed or cancelled");
    }
    if (READ_ONLY_APPOINTMENT_STATUSES.includes(encounter.appointment_status)) {
      throw new ConflictException("Consultation is read-only after the appointment is cancelled");
    }
  }

  private map(row: MaterialRow) {
    return {
      id: row.id,
      encounterId: row.encounter_id,
      appointmentId: row.appointment_id,
      authorRole: row.author_role,
      type: row.material_type,
      body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
      document: row.document_id
        ? {
            id: row.document_id,
            originalName: row.document_name,
            mimeType: row.document_mime_type,
            sizeBytes: row.document_size_bytes === null ? null : Number(row.document_size_bytes),
          }
        : null,
      metadata: row.metadata,
    };
  }

  async list(principal: Principal, appointmentId: string, before?: string, limit = 50) {
    const { encounter } = await this.requireParticipant(principal, appointmentId);
    if (before && Number.isNaN(Date.parse(before))) throw new BadRequestException("Invalid before cursor");
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 100);
    const { rows } = await this.db.query<MaterialRow>(
      `select m.id,m.encounter_id,m.appointment_id,m.author_user_id,m.author_role,m.material_type,
              m.document_id,m.body,m.metadata,m.created_at,
              d.original_name document_name,d.mime_type document_mime_type,d.size_bytes document_size_bytes
       from consultation_materials m
       left join medical_documents d on d.id=m.document_id
       where m.encounter_id=$1
         and ($2::timestamptz is null or m.created_at < $2::timestamptz)
       order by m.created_at desc
       limit $3`,
      [encounter.encounter_id, before ?? null, take],
    );

    return {
      encounterId: encounter.encounter_id,
      encounterStatus: encounter.encounter_status,
      canPost: WRITABLE_ENCOUNTER_STATUSES.includes(encounter.encounter_status)
        && !READ_ONLY_APPOINTMENT_STATUSES.includes(encounter.appointment_status),
      items: rows.map((row) => this.map(row)).reverse(),
    };
  }

  async postChat(principal: Principal, appointmentId: string, input: ChatMessageDto) {
    const { user, encounter, role } = await this.requireParticipant(principal, appointmentId);
    this.assertWritable(encounter);

    const { rows } = await this.db.query<MaterialRow>(
      `insert into consultation_materials(encounter_id,appointment_id,author_user_id,author_role,material_type,body)
       values ($1,$2,$3,$4,'chat',$5)
       returning id,encounter_id,appointment_id,author_user_id,author_role,material_type,document_id,body,metadata,created_at,
                 null::text document_name,null::text document_mime_type,null::bigint document_size_bytes`,
      [encounter.encounter_id, encounter.appointment_id, user.id, role, input.body],
    );

    // Chat text is medical free text and is deliberately not copied to audit.
    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "consultation.material.chat",
      resourceType: "consultation_material",
      resourceId: rows[0].id,
      metadata: { appointmentId, encounterId: encounter.encounter_id, role },
    });
    return this.map(rows[0]);
  }

  async attachDocument(principal: Principal, appointmentId: string, input: AttachDocumentDto) {
    const { user, encounter, role } = await this.requireParticipant(principal, appointmentId);
    this.assertWritable(encounter);

    // The actor must already be allowed to see the document (owner or active
    // doctor grant), and the document must belong to this patient.
    const document = await this.db.query<{ id: string }>(
      `select d.id
       from medical_documents d
       join medical_encounters e on e.id=$2 and e.patient_profile_id=d.patient_profile_id
       where d.id=$1 and d.status='active'
         and (
           exists(select 1 from patient_profiles p where p.id=d.patient_profile_id and p.owner_user_id=$3)
           or exists(select 1 from document_grants g join doctor_profiles dp on dp.id=g.doctor_id
                     where g.document_id=d.id and dp.account_user_id=$3 and g.revoked_at is null
                       and (g.expires_at is null or g.expires_at>now()))
         )`,
      [input.documentId, encounter.encounter_id, user.id],
    );
    if (!document.rows[0]) throw new ForbiddenException("Document is not available for this consultation");

    const inserted = await this.db.query<MaterialRow>(
      `insert into consultation_materials(encounter_id,appointment_id,author_user_id,author_role,material_type,document_id)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (document_id) do nothing
       returning id,encounter_id,appointment_id,author_user_id,author_role,material_type,document_id,body,metadata,created_at,
                 null::text document_name,null::text document_mime_type,null::bigint document_size_bytes`,
      [encounter.encounter_id, encounter.appointment_id, user.id, role, input.materialType, input.documentId],
    );
    if (!inserted.rows[0]) throw new ConflictException("Document is already attached to a consultation");

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "consultation.material.attach",
      resourceType: "consultation_material",
      resourceId: inserted.rows[0].id,
      metadata: { appointmentId, encounterId: encounter.encounter_id, materialType: input.materialType, role },
    });
    return this.map(inserted.rows[0]);
  }
}
