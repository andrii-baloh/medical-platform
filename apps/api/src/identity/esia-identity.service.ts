import { Injectable } from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
@Injectable()
export class EsiaIdentityService {
  constructor(private readonly db: DbService, private readonly users: UsersService) {}
  async status(principal: Principal) { const user=await this.users.ensureAccount(principal); const {rows}=await this.db.query(`select provider_subject as "esiaId",status,linked_at as "linkedAt",verified_at as "verifiedAt",last_seen_at as "lastSeenAt" from federated_identities where user_id=$1 and provider='esia' and status<>'revoked' limit 1`,[user.id]); return {provider:"esia",linked:Boolean(rows[0]),identity:rows[0]??null,federation:"keycloak"}; }
  async patientMatches(principal: Principal) { const user=await this.users.ensureAccount(principal); const {rows}=await this.db.query(`select m.id,m.status,m.match_basis as "matchBasis",m.verified_at as "verifiedAt",p.id as "patientProfileId",p.full_name as "patientName" from patient_identity_matches m join patient_profiles p on p.id=m.patient_profile_id join federated_identities f on f.id=m.federated_identity_id where f.user_id=$1 and f.provider='esia' order by m.created_at desc`,[user.id]); return rows; }
  async representativeIdentity(principal: Principal) { const user=await this.users.ensureAccount(principal); const {rows}=await this.db.query(`select representative_id as "representativeId",patient_profile_id as "patientProfileId",representative_status as "representativeStatus",esia_id as "esiaId",identity_status as "identityStatus",identity_verified_at as "identityVerifiedAt" from representative_identity_status where representative_user_id=$1 order by representative_id`,[user.id]); return rows; }
}
