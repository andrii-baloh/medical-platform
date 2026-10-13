import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import type {
  AcceptPatientContractDto,
  CreateContractTemplateDto,
  CreateServiceCatalogDto,
  CreateServiceOfferDto,
  PublishContractVersionDto,
} from "./commercial-services.dto";

@Injectable()
export class CommercialServicesService {
  constructor(
    private readonly db: DbService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async requireAdmin(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    if (!principal.roles.includes("admin")) throw new ForbiddenException("Admin role required");
    const { rows } = await this.db.query<{ ok: number }>(
      `select 1 ok from user_roles where user_id=$1 and role='admin'`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Admin role required");
    return user;
  }

  private async requireDoctor(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    if (!principal.roles.includes("doctor")) throw new ForbiddenException("Doctor role required");
    const { rows } = await this.db.query(
      `select d.id,d.full_name
       from doctor_profiles d
       join user_roles r on r.user_id=d.account_user_id and r.role='doctor'
       where d.account_user_id=$1 and d.verified=true
       limit 1`,
      [user.id],
    );
    if (!rows[0]) throw new ForbiddenException("Verified doctor profile is required");
    return { user, doctor: rows[0] };
  }

  async createCatalog(principal: Principal, input: CreateServiceCatalogDto) {
    const actor = await this.requireAdmin(principal);
    const org = await this.db.query(`select id from medical_organizations where id=$1 and active=true`, [input.organizationId]);
    if (!org.rows[0]) throw new NotFoundException("Active medical organization not found");
    const { rows } = await this.db.query(
      `insert into service_catalogs(organization_id,code,name,description)
       values($1,$2,$3,$4)
       returning id,organization_id as "organizationId",code,name,description,active,created_at as "createdAt"`,
      [input.organizationId, input.code.trim(), input.name.trim(), input.description?.trim() || null],
    );
    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: "commercial.service_catalog.create",
      resourceType: "service_catalog",
      resourceId: rows[0].id,
      metadata: { organizationId: input.organizationId },
    });
    return rows[0];
  }

  async createContractTemplate(principal: Principal, input: CreateContractTemplateDto) {
    const actor = await this.requireAdmin(principal);
    const org = await this.db.query(`select id from medical_organizations where id=$1 and active=true`, [input.organizationId]);
    if (!org.rows[0]) throw new NotFoundException("Active medical organization not found");
    const { rows } = await this.db.query(
      `insert into contract_templates(organization_id,code,display_name)
       values($1,$2,$3)
       returning id,organization_id as "organizationId",code,display_name as "displayName",active,created_at as "createdAt"`,
      [input.organizationId, input.code.trim(), input.displayName.trim()],
    );
    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: "commercial.contract_template.create",
      resourceType: "contract_template",
      resourceId: rows[0].id,
      metadata: { organizationId: input.organizationId },
    });
    return rows[0];
  }

  async publishContractVersion(principal: Principal, templateId: string, input: PublishContractVersionDto) {
    const actor = await this.requireAdmin(principal);
    const template = await this.db.query(
      `select ct.id,ct.organization_id
       from contract_templates ct
       join medical_organizations o on o.id=ct.organization_id and o.active=true
       where ct.id=$1 and ct.active=true`,
      [templateId],
    );
    if (!template.rows[0]) throw new NotFoundException("Active contract template not found");
    const contentText = input.contentText.trim();
    if (!contentText) throw new UnprocessableEntityException("Contract text cannot be empty");
    const hash = createHash("sha256").update(contentText, "utf8").digest("hex");
    try {
      const { rows } = await this.db.query(
        `insert into contract_versions(template_id,version_no,locale,content_text,content_sha256)
         values($1,$2,$3,$4,$5)
         returning id,template_id as "templateId",version_no as "versionNo",locale,content_sha256 as "contentSha256",published_at as "publishedAt"`,
        [templateId, input.versionNo, input.locale, contentText, hash],
      );
      await this.audit.record({
        actorUserId: actor.id,
        actorSubject: principal.sub,
        action: "commercial.contract_version.publish",
        resourceType: "contract_version",
        resourceId: rows[0].id,
        metadata: { templateId, versionNo: input.versionNo, locale: input.locale },
      });
      return rows[0];
    } catch (error: any) {
      if (error?.code === "23505") throw new ConflictException("This contract version already exists");
      throw error;
    }
  }

  async createOffer(principal: Principal, input: CreateServiceOfferDto) {
    const actor = await this.requireAdmin(principal);
    const facts = await this.db.query(
      `select
         sc.organization_id catalog_organization_id,
         ct.organization_id template_organization_id,
         o.active organization_active,
         d.verified doctor_verified,
         exists(
           select 1 from doctor_organization_memberships m
           where m.doctor_id=$3 and m.organization_id=sc.organization_id and m.active=true
             and (m.starts_at is null or m.starts_at<=current_date)
             and (m.ends_at is null or m.ends_at>=current_date)
         ) doctor_membership_active
       from service_catalogs sc
       join contract_templates ct on ct.id=$2 and ct.active=true
       join medical_organizations o on o.id=sc.organization_id
       join doctor_profiles d on d.id=$3
       where sc.id=$1 and sc.active=true`,
      [input.serviceCatalogId, input.contractTemplateId, input.doctorId],
    );
    const row = facts.rows[0];
    if (!row) throw new NotFoundException("Catalog, contract template, or doctor not found");
    if (row.catalog_organization_id !== row.template_organization_id) {
      throw new ConflictException("Catalog and contract template must belong to the same organization");
    }
    if (!row.organization_active) throw new ConflictException("Medical organization is inactive");
    if (!row.doctor_verified || !row.doctor_membership_active) {
      throw new ConflictException("Doctor must be verified and actively linked to the medical organization");
    }
    const currentVersion = await this.db.query(
      `select id from contract_versions
       where template_id=$1 and retired_at is null and published_at<=now()
       order by version_no desc,published_at desc limit 1`,
      [input.contractTemplateId],
    );
    if (!currentVersion.rows[0]) throw new ConflictException("Publish a contract version before creating an offer");
    const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && validUntil <= validFrom) throw new UnprocessableEntityException("Offer end must be after start");

    const { rows } = await this.db.query(
      `insert into service_offers(
         service_catalog_id,organization_id,doctor_id,contract_template_id,title,description,
         price_minor,currency,conditions_text,refund_policy_text,service_procedure_text,valid_from,valid_until
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id,service_catalog_id as "serviceCatalogId",organization_id as "organizationId",
                 doctor_id as "doctorId",contract_template_id as "contractTemplateId",title,description,
                 price_minor as "priceMinor",currency,conditions_text as "conditionsText",
                 refund_policy_text as "refundPolicyText",service_procedure_text as "serviceProcedureText",
                 active,valid_from as "validFrom",valid_until as "validUntil",created_at as "createdAt"`,
      [
        input.serviceCatalogId,
        row.catalog_organization_id,
        input.doctorId,
        input.contractTemplateId,
        input.title.trim(),
        input.description?.trim() || null,
        input.priceMinor,
        input.currency,
        input.conditionsText.trim(),
        input.refundPolicyText.trim(),
        input.serviceProcedureText.trim(),
        validFrom,
        validUntil,
      ],
    );
    await this.audit.record({
      actorUserId: actor.id,
      actorSubject: principal.sub,
      action: "commercial.service_offer.create",
      resourceType: "service_offer",
      resourceId: rows[0].id,
      metadata: { organizationId: row.catalog_organization_id, doctorId: input.doctorId },
    });
    return rows[0];
  }

  async adminOverview(principal: Principal) {
    await this.requireAdmin(principal);
    const [catalogs, templates, offers] = await Promise.all([
      this.db.query(
        `select sc.id,sc.organization_id as "organizationId",o.short_name as "organizationName",sc.code,sc.name,sc.description,sc.active
         from service_catalogs sc join medical_organizations o on o.id=sc.organization_id order by o.short_name,sc.name`,
      ),
      this.db.query(
        `select ct.id,ct.organization_id as "organizationId",o.short_name as "organizationName",ct.code,ct.display_name as "displayName",ct.active,
                cv.id as "currentVersionId",cv.version_no as "currentVersionNo",cv.locale,cv.published_at as "publishedAt"
         from contract_templates ct
         join medical_organizations o on o.id=ct.organization_id
         left join lateral(
           select id,version_no,locale,published_at from contract_versions v
           where v.template_id=ct.id and v.retired_at is null and v.published_at<=now()
           order by v.version_no desc,v.published_at desc limit 1
         ) cv on true
         order by o.short_name,ct.display_name`,
      ),
      this.db.query(
        `select so.id,so.title,so.price_minor as "priceMinor",so.currency,so.active,
                so.valid_from as "validFrom",so.valid_until as "validUntil",
                sc.name as "serviceName",o.short_name as "organizationName",d.full_name as "doctorName"
         from service_offers so
         join service_catalogs sc on sc.id=so.service_catalog_id
         join medical_organizations o on o.id=so.organization_id
         join doctor_profiles d on d.id=so.doctor_id
         order by so.created_at desc`,
      ),
    ]);
    return { catalogs: catalogs.rows, contractTemplates: templates.rows, offers: offers.rows };
  }

  async doctorOffers(principal: Principal) {
    const { doctor } = await this.requireDoctor(principal);
    const { rows } = await this.db.query(
      `select so.id,so.title,so.description,so.price_minor as "priceMinor",so.currency,
              sc.name as "serviceName",o.short_name as "organizationName",o.license_number as "licenseNumber"
       from service_offers so
       join service_catalogs sc on sc.id=so.service_catalog_id and sc.active=true
       join medical_organizations o on o.id=so.organization_id and o.active=true
       join contract_templates ct on ct.id=so.contract_template_id and ct.active=true
       where so.doctor_id=$1 and so.active=true and so.valid_from<=now()
         and (so.valid_until is null or so.valid_until>now())
         and exists(
           select 1 from contract_versions cv
           where cv.template_id=ct.id and cv.retired_at is null and cv.published_at<=now()
         )
       order by so.title`,
      [doctor.id],
    );
    return rows;
  }

  private async ownedAppointment(userId: string, appointmentId: string) {
    const { rows } = await this.db.query(
      `select a.*,p.owner_user_id
       from appointments a
       join patient_profiles p on p.id=a.patient_profile_id
       where a.id=$1 and p.owner_user_id=$2`,
      [appointmentId, userId],
    );
    if (!rows[0]) throw new NotFoundException("Appointment not found");
    return rows[0];
  }

  private async commercialFacts(appointmentId: string) {
    const { rows } = await this.db.query(
      `select
         a.id appointment_id,a.status appointment_status,a.patient_profile_id,a.doctor_id,a.service_offer_id,
         a.price_minor appointment_price_minor,a.currency appointment_currency,a.patient_contract_id,
         so.title offer_title,so.description offer_description,so.price_minor offer_price_minor,so.currency offer_currency,
         so.conditions_text,so.refund_policy_text,so.service_procedure_text,so.active offer_active,
         so.valid_from,so.valid_until,so.contract_template_id,
         sc.id service_catalog_id,sc.code service_code,sc.name service_name,sc.description service_description,sc.active catalog_active,
         o.id organization_id,o.legal_name,o.short_name,o.address,o.license_number,o.license_date,o.licensing_authority,o.active organization_active,
         d.slug doctor_slug,d.full_name doctor_name,d.verified doctor_verified,d.published doctor_published,
         coalesce(sp.name_ru,'Специалист') specialty,
         ct.display_name contract_display_name,ct.active contract_template_active,
         current_cv.id current_contract_version_id,current_cv.version_no current_contract_version_no,current_cv.locale current_contract_locale,
         current_cv.content_text current_contract_text,current_cv.content_sha256 current_contract_sha256,current_cv.published_at current_contract_published_at,
         pc.id patient_contract_id_actual,pc.status patient_contract_status,pc.contract_version_id accepted_contract_version_id,pc.accepted_at,
         accepted_cv.version_no accepted_contract_version_no,accepted_cv.locale accepted_contract_locale,
         accepted_cv.content_text accepted_contract_text,accepted_cv.content_sha256 accepted_contract_sha256,accepted_cv.published_at accepted_contract_published_at
       from appointments a
       left join service_offers so on so.id=a.service_offer_id
       left join service_catalogs sc on sc.id=so.service_catalog_id
       left join medical_organizations o on o.id=so.organization_id
       left join doctor_profiles d on d.id=a.doctor_id
       left join doctor_specialties ds on ds.doctor_id=d.id and ds.is_primary=true
       left join specialties sp on sp.id=ds.specialty_id
       left join contract_templates ct on ct.id=so.contract_template_id
       left join lateral(
         select v.* from contract_versions v
         where v.template_id=ct.id and v.retired_at is null and v.published_at<=now()
         order by v.version_no desc,v.published_at desc limit 1
       ) current_cv on true
       left join patient_contracts pc on pc.id=a.patient_contract_id and pc.appointment_id=a.id
       left join contract_versions accepted_cv on accepted_cv.id=pc.contract_version_id
       where a.id=$1`,
      [appointmentId],
    );
    return rows[0] ?? null;
  }

  private mapCheckout(facts: any) {
    if (!facts?.service_offer_id) {
      return {
        appointmentId: facts?.appointment_id,
        configured: false,
        readyForPayment: false,
        reason: "service_offer_missing",
      };
    }
    const offerValid = Boolean(
      facts.offer_active &&
      facts.catalog_active &&
      facts.organization_active &&
      facts.doctor_verified &&
      new Date(facts.valid_from).getTime() <= Date.now() &&
      (!facts.valid_until || new Date(facts.valid_until).getTime() > Date.now()),
    );
    const accepted = Boolean(facts.patient_contract_id_actual && facts.patient_contract_status === "accepted");
    const versionId = accepted ? facts.accepted_contract_version_id : facts.current_contract_version_id;
    const versionNo = accepted ? facts.accepted_contract_version_no : facts.current_contract_version_no;
    const locale = accepted ? facts.accepted_contract_locale : facts.current_contract_locale;
    const contentText = accepted ? facts.accepted_contract_text : facts.current_contract_text;
    const contentSha256 = accepted ? facts.accepted_contract_sha256 : facts.current_contract_sha256;
    const publishedAt = accepted ? facts.accepted_contract_published_at : facts.current_contract_published_at;
    const configured = Boolean(offerValid && facts.contract_template_active && versionId && contentText);
    return {
      appointmentId: facts.appointment_id,
      configured,
      readyForPayment: Boolean(configured && accepted),
      reason: configured ? null : !versionId ? "contract_version_missing" : "commercial_offer_inactive",
      organization: {
        id: facts.organization_id,
        legalName: facts.legal_name,
        shortName: facts.short_name,
        address: facts.address,
        license: {
          number: facts.license_number,
          date: facts.license_date,
          authority: facts.licensing_authority,
        },
      },
      service: {
        catalogId: facts.service_catalog_id,
        code: facts.service_code,
        name: facts.service_name,
        description: facts.service_description,
        offerId: facts.service_offer_id,
        title: facts.offer_title,
        offerDescription: facts.offer_description,
      },
      doctor: {
        id: facts.doctor_id,
        slug: facts.doctor_slug,
        fullName: facts.doctor_name,
        specialty: facts.specialty,
      },
      price: { amountMinor: facts.appointment_price_minor, currency: facts.appointment_currency },
      terms: {
        conditions: facts.conditions_text,
        refundPolicy: facts.refund_policy_text,
        serviceProcedure: facts.service_procedure_text,
      },
      contract: versionId ? {
        templateId: facts.contract_template_id,
        displayName: facts.contract_display_name,
        versionId,
        versionNo,
        locale,
        contentText,
        contentSha256,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      } : null,
      patientContract: facts.patient_contract_id_actual ? {
        id: facts.patient_contract_id_actual,
        status: facts.patient_contract_status,
        acceptedAt: facts.accepted_at ? new Date(facts.accepted_at).toISOString() : null,
      } : null,
    };
  }

  async checkout(principal: Principal, appointmentId: string) {
    const user = await this.users.ensureAccount(principal);
    await this.ownedAppointment(user.id, appointmentId);
    const facts = await this.commercialFacts(appointmentId);
    return this.mapCheckout(facts);
  }

  async acceptContract(principal: Principal, appointmentId: string, input: AcceptPatientContractDto) {
    const user = await this.users.ensureAccount(principal);
    const appointment = await this.ownedAppointment(user.id, appointmentId);
    if (["cancelled_by_patient", "cancelled_by_doctor", "no_show"].includes(appointment.status)) {
      throw new ConflictException("Contract cannot be accepted for an inactive appointment");
    }
    const facts = await this.commercialFacts(appointmentId);
    const checkout = this.mapCheckout(facts) as any;
    if (!checkout.configured || !checkout.contract) {
      throw new ConflictException("Commercial terms are not configured for this appointment");
    }
    if (checkout.contract.versionId !== input.contractVersionId) {
      throw new ConflictException("Contract version changed; review the current terms before accepting");
    }
    if (facts.appointment_price_minor !== facts.offer_price_minor || facts.appointment_currency !== facts.offer_currency) {
      throw new ConflictException("Appointment price does not match the commercial offer");
    }

    const snapshot = {
      organization: checkout.organization,
      service: checkout.service,
      doctor: checkout.doctor,
      price: checkout.price,
      terms: checkout.terms,
      contract: {
        templateId: checkout.contract.templateId,
        displayName: checkout.contract.displayName,
        versionId: checkout.contract.versionId,
        versionNo: checkout.contract.versionNo,
        locale: checkout.contract.locale,
        contentSha256: checkout.contract.contentSha256,
        publishedAt: checkout.contract.publishedAt,
      },
    };

    const contract = await this.db.tx(async (client) => {
      const locked = await client.query(
        `select a.id,a.patient_contract_id
         from appointments a
         join patient_profiles p on p.id=a.patient_profile_id
         where a.id=$1 and p.owner_user_id=$2
         for update of a`,
        [appointmentId, user.id],
      );
      if (!locked.rows[0]) throw new NotFoundException("Appointment not found");
      if (locked.rows[0].patient_contract_id) {
        const existing = await client.query(`select * from patient_contracts where id=$1`, [locked.rows[0].patient_contract_id]);
        const row = existing.rows[0];
        if (row?.status === "accepted" && row.contract_version_id === input.contractVersionId) return row;
        throw new ConflictException("Appointment already has a different commercial contract");
      }

      const inserted = await client.query(
        `insert into patient_contracts(
           appointment_id,patient_profile_id,accepted_by_user_id,service_offer_id,contract_version_id,
           organization_id,doctor_id,price_minor,currency,status,contract_content_sha256,commercial_snapshot
         ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'accepted',$10,$11::jsonb)
         returning *`,
        [
          appointmentId,
          appointment.patient_profile_id,
          user.id,
          facts.service_offer_id,
          input.contractVersionId,
          facts.organization_id,
          facts.doctor_id,
          facts.appointment_price_minor,
          facts.appointment_currency,
          checkout.contract.contentSha256,
          JSON.stringify(snapshot),
        ],
      );
      const created = inserted.rows[0];
      await client.query(
        `insert into contract_acceptance_events(
           patient_contract_id,actor_user_id,event_type,authentication_method,contract_content_sha256,evidence
         ) values($1,$2,'accepted',$3,$4,$5::jsonb)`,
        [
          created.id,
          user.id,
          input.authenticationMethod,
          checkout.contract.contentSha256,
          JSON.stringify({ subject: principal.sub, contractVersionId: input.contractVersionId }),
        ],
      );
      await client.query(`update appointments set patient_contract_id=$2,updated_at=now() where id=$1`, [appointmentId, created.id]);
      return created;
    });

    await this.audit.record({
      actorUserId: user.id,
      actorSubject: principal.sub,
      action: "commercial.patient_contract.accept",
      resourceType: "patient_contract",
      resourceId: contract.id,
      metadata: {
        appointmentId,
        serviceOfferId: facts.service_offer_id,
        contractVersionId: input.contractVersionId,
        authenticationMethod: input.authenticationMethod,
      },
    });
    return this.checkout(principal, appointmentId);
  }

  async patientContracts(principal: Principal) {
    const user = await this.users.ensureAccount(principal);
    const { rows } = await this.db.query(
      `select pc.id,pc.appointment_id as "appointmentId",pc.status,pc.price_minor as "priceMinor",pc.currency,
              pc.accepted_at as "acceptedAt",pc.fulfilled_at as "fulfilledAt",pc.cancelled_at as "cancelledAt",
              pc.commercial_snapshot as "commercialSnapshot",cv.version_no as "contractVersionNo"
       from patient_contracts pc
       join patient_profiles p on p.id=pc.patient_profile_id
       join contract_versions cv on cv.id=pc.contract_version_id
       where p.owner_user_id=$1
       order by pc.accepted_at desc`,
      [user.id],
    );
    return rows;
  }
}
