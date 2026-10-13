import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { Principal } from "../auth/principal";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { SIGNATURE_PROVIDER, type SignatureProvider } from "./signature.provider";
@Injectable()
export class SignatureService {
  constructor(private readonly db:DbService,private readonly users:UsersService,private readonly audit:AuditService,@Inject(SIGNATURE_PROVIDER) private readonly provider:SignatureProvider) {}
  async signDocumentVersion(principal:Principal,versionId:string){
    if(!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role is required");
    const user=await this.users.ensureAccount(principal);
    const doctor=await this.db.query(`select id,full_name from doctor_profiles where account_user_id=$1 and verified=true limit 1`,[user.id]);
    if(!doctor.rows[0]) throw new ForbiddenException("Verified doctor profile is required");
    const v=await this.db.query(`select v.*,d.patient_profile_id from medical_document_versions v join medical_documents d on d.id=v.document_id where v.id=$1`,[versionId]);
    const version=v.rows[0]; if(!version) throw new NotFoundException("Document version not found");
    const relationship=await this.db.query(`select 1 from appointments where patient_profile_id=$1 and doctor_id=$2 union all select 1 from medical_encounters where patient_profile_id=$1 and doctor_id=$2 limit 1`,[version.patient_profile_id,doctor.rows[0].id]);
    if(!relationship.rowCount) throw new ForbiddenException("Doctor has no relationship with this patient");
    const existing=await this.db.query(`select * from medical_document_signatures where document_version_id=$1 and provider=$2 and signature_status<>'revoked' limit 1`,[versionId,this.provider.name]);
    if(existing.rows[0]) return mapSignature(existing.rows[0]);
    if(!version.sha256_hex) throw new ConflictException("Document version has no immutable SHA-256 hash");
    const signingTime=new Date(); const result=await this.provider.sign({documentHash:version.sha256_hex,signingTime,signer:{userId:user.id,doctorId:doctor.rows[0].id,fullName:doctor.rows[0].full_name}});
    const inserted=await this.db.query(`insert into medical_document_signatures(document_version_id,certificate_info,signature,signing_time,document_hash,signature_status,provider,signed_by_user_id,signed_by_doctor_id,qualification_status) values($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,[versionId,JSON.stringify(result.certificateInfo),result.signature,signingTime,version.sha256_hex,result.status,result.provider,user.id,doctor.rows[0].id,result.qualificationStatus]);
    await this.audit.record({actorUserId:user.id,actorSubject:principal.sub,action:"medical_document.signature.create",resourceType:"medical_document_version",resourceId:versionId,metadata:{provider:result.provider,qualificationStatus:result.qualificationStatus}});
    return mapSignature(inserted.rows[0]);
  }
  async list(principal:Principal,versionId:string){ const user=await this.users.ensureAccount(principal); const access=await this.db.query(`select 1 from medical_document_versions v join medical_documents d on d.id=v.document_id join patient_profiles p on p.id=d.patient_profile_id where v.id=$1 and (p.owner_user_id=$2 or exists(select 1 from doctor_profiles dp where dp.account_user_id=$2 and dp.verified=true and (exists(select 1 from appointments a where a.patient_profile_id=d.patient_profile_id and a.doctor_id=dp.id) or exists(select 1 from medical_encounters e where e.patient_profile_id=d.patient_profile_id and e.doctor_id=dp.id))) or exists(select 1 from user_roles r where r.user_id=$2 and r.role='admin'))`,[versionId,user.id]); if(!access.rowCount) throw new NotFoundException("Document version not found"); const {rows}=await this.db.query(`select * from medical_document_signatures where document_version_id=$1 order by signing_time desc`,[versionId]); return rows.map(mapSignature); }
}
function mapSignature(r:any){return{id:r.id,documentVersionId:r.document_version_id,certificateInfo:r.certificate_info,signature:r.signature,signingTime:new Date(r.signing_time).toISOString(),documentHash:r.document_hash,status:r.signature_status,provider:r.provider,qualificationStatus:r.qualification_status};}
