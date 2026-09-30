import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { HeadObjectCommand, PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import type { CompleteUploadDto, CreateUploadIntentDto, GrantDocumentDto } from "./document.dto";

@Injectable()
export class DocumentsService {
  private readonly bucket = process.env.S3_BUCKET_MEDICAL!;
  private readonly ttl = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300);
  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "local",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "false") === "true",
    credentials: process.env.S3_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    } : undefined,
  });

  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select d.* from medical_documents d
       join patient_profiles p on p.id=d.patient_profile_id
       where p.owner_user_id=$1 and d.status <> 'deleted'
       order by d.created_at desc`,
      [user.id],
    );
    return rows.map(mapDocument);
  }

  async createUploadIntent(principal: Principal, input: CreateUploadIntentDto) {
    const user = await this.users.ensureAccount(principal);
    await this.users.requireOwnedPatient(user.id, input.patientProfileId);
    const allowed = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
    if (!allowed.has(input.mimeType)) throw new UnprocessableEntityException("Unsupported file type");

    const now = new Date();
    const country = (process.env.DEPLOYMENT_COUNTRY ?? "XX").toLowerCase();
    const key = `${country}/${input.patientProfileId}/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}/${randomUUID()}`;
    const { rows } = await this.db.query(
      `insert into medical_documents(patient_profile_id,uploaded_by_user_id,storage_key,original_name,mime_type,size_bytes,category,status)
       values ($1,$2,$3,$4,$5,$6,$7,'uploading') returning *`,
      [input.patientProfileId, user.id, key, input.originalName, input.mimeType, input.sizeBytes, input.category],
    );
    const document = rows[0];
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: input.mimeType }),
      { expiresIn: this.ttl },
    );
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "document.upload.intent", resourceType: "medical_document", resourceId: document.id });
    return { document: mapDocument(document), uploadUrl, method: "PUT", expiresInSeconds: this.ttl, requiredHeaders: { "content-type": input.mimeType } };
  }

  async complete(principal: Principal, documentId: string, input: CompleteUploadDto) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query<MedicalDocumentRow>(
      `select d.* from medical_documents d
       join patient_profiles p on p.id=d.patient_profile_id
       where d.id=$1 and p.owner_user_id=$2 and d.status='uploading'`,
      [documentId, user.id],
    );
    const doc = rows[0];
    if (!doc) throw new NotFoundException("Upload not found");

    const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: doc.storage_key }));
    if (Number(head.ContentLength ?? -1) !== Number(doc.size_bytes)) {
      await this.quarantineIntegrityFailure(documentId, "size_mismatch");
      throw new UnprocessableEntityException("Uploaded size does not match declared size");
    }
    if (head.ContentType && head.ContentType !== doc.mime_type) {
      await this.quarantineIntegrityFailure(documentId, "content_type_mismatch");
      throw new UnprocessableEntityException("Uploaded content type does not match declared type");
    }

    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: doc.storage_key }));
    if (!object.Body) {
      await this.quarantineIntegrityFailure(documentId, "object_body_missing");
      throw new UnprocessableEntityException("Uploaded object cannot be inspected");
    }
    const bytes = await object.Body.transformToByteArray();
    const detectedMimeType = detectMimeType(bytes);
    if (!detectedMimeType || detectedMimeType !== doc.mime_type) {
      await this.quarantineIntegrityFailure(documentId, "magic_bytes_mismatch", detectedMimeType ?? null);
      throw new UnprocessableEntityException("Uploaded file signature does not match declared type");
    }

    const authoritativeSha256 = createHash("sha256").update(bytes).digest("hex");
    if (input.sha256Hex && input.sha256Hex.toLowerCase() !== authoritativeSha256) {
      await this.quarantineIntegrityFailure(documentId, "sha256_mismatch", detectedMimeType);
      throw new UnprocessableEntityException("Uploaded checksum does not match");
    }

    const updated = await this.db.tx(async (client) => {
      const result = await client.query<MedicalDocumentRow>(
        `update medical_documents
         set status='quarantined',activated_at=null,sha256_hex=$2,detected_mime_type=$3,
             scan_status='pending',scan_provider=null,scan_completed_at=null,scan_error_code=null
         where id=$1 returning *`,
        [documentId, authoritativeSha256, detectedMimeType],
      );
      await client.query(
        `insert into document_scan_jobs(document_id,status,attempts,updated_at)
         values ($1,'pending',0,now())
         on conflict (document_id) do update
         set status='pending',attempts=0,claimed_at=null,claimed_by=null,claim_expires_at=null,
             completed_at=null,last_error_code=null,updated_at=now()`,
        [documentId],
      );
      return result.rows[0];
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "document.upload.quarantine",
      resourceType: "medical_document",
      resourceId: documentId,
      metadata: { detectedMimeType, scanStatus: "pending" },
    });
    return mapDocument(updated);
  }

  private async quarantineIntegrityFailure(documentId: string, errorCode: string, detectedMimeType: string | null = null) {
    await this.db.query(
      `update medical_documents
       set status='quarantined',scan_status='error',detected_mime_type=coalesce($3,detected_mime_type),
           scan_error_code=$2,scan_completed_at=null
       where id=$1`,
      [documentId, errorCode, detectedMimeType],
    );
  }

  async downloadUrl(principal: Principal, documentId: string) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select d.*,
          exists(select 1 from patient_profiles p where p.id=d.patient_profile_id and p.owner_user_id=$2) as is_owner,
          exists(
            select 1 from document_grants g
            join doctor_profiles dp on dp.id=g.doctor_id
            where g.document_id=d.id and dp.account_user_id=$2 and g.revoked_at is null
              and (g.expires_at is null or g.expires_at>now())
          ) as has_doctor_grant
       from medical_documents d where d.id=$1 and d.status='active'`,
      [documentId, user.id],
    );
    const doc = rows[0];
    if (!doc) throw new NotFoundException("Document not found");
    if (!doc.is_owner && !doc.has_doctor_grant) throw new ForbiddenException("Document access denied");
    const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: doc.storage_key }), { expiresIn: this.ttl });
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "document.download_url", resourceType: "medical_document", resourceId: documentId });
    return { url, expiresInSeconds: this.ttl };
  }

  async grant(principal: Principal, documentId: string, input: GrantDocumentDto) {
    const user = await this.users.ensureAccount(principal);
    const owned = await this.db.query(
      `select d.patient_profile_id from medical_documents d
       join patient_profiles p on p.id=d.patient_profile_id
       where d.id=$1 and d.status='active' and p.owner_user_id=$2`,
      [documentId, user.id],
    );
    if (!owned.rows[0]) throw new NotFoundException("Document not found");
    const relationship = await this.db.query(
      `select 1 from appointments where patient_profile_id=$1 and doctor_id=$2 limit 1`,
      [owned.rows[0].patient_profile_id, input.doctorId],
    );
    if (!relationship.rowCount) throw new ForbiddenException("Document can only be shared with a doctor connected to this patient");
    await this.db.query(
      `insert into document_grants(document_id,doctor_id,granted_by_user_id,expires_at,revoked_at)
       values ($1,$2,$3,$4,null)
       on conflict (document_id,doctor_id) do update set granted_by_user_id=excluded.granted_by_user_id,granted_at=now(),expires_at=excluded.expires_at,revoked_at=null`,
      [documentId, input.doctorId, user.id, input.expiresAt ? new Date(input.expiresAt) : null],
    );
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "document.grant", resourceType: "medical_document", resourceId: documentId, metadata: { doctorId: input.doctorId } });
    return { ok: true };
  }

  async revoke(principal: Principal, documentId: string, doctorId: string) {
    const user = await this.users.ensureAccount(principal);
    const result = await this.db.query(
      `update document_grants g set revoked_at=now()
       from medical_documents d, patient_profiles p
       where g.document_id=$1 and g.doctor_id=$2 and d.id=g.document_id and p.id=d.patient_profile_id and p.owner_user_id=$3
       returning g.document_id`,
      [documentId, doctorId, user.id],
    );
    if (!result.rowCount) throw new NotFoundException("Grant not found");
    await this.audit.record({ actorUserId: user.id, actorSubject: principal.sub, action: "document.grant.revoke", resourceType: "medical_document", resourceId: documentId, metadata: { doctorId } });
    return { ok: true };
  }
}

type MedicalDocumentRow = {
  id: string;
  patient_profile_id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  detected_mime_type: string | null;
  size_bytes: string | number;
  sha256_hex: string | null;
  category: string;
  status: string;
  scan_status: string;
  scan_provider: string | null;
  scan_completed_at: Date | null;
  created_at: Date;
};

function mapDocument(r: MedicalDocumentRow) {
  return {
    id: r.id,
    patientProfileId: r.patient_profile_id,
    originalName: r.original_name,
    mimeType: r.mime_type,
    detectedMimeType: r.detected_mime_type,
    sizeBytes: Number(r.size_bytes),
    category: r.category,
    status: r.status,
    scanStatus: r.scan_status,
    scanProvider: r.scan_provider,
    scanCompletedAt: r.scan_completed_at ? new Date(r.scan_completed_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function detectMimeType(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}
