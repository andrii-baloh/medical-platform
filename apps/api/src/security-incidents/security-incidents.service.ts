import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Principal } from "../auth/principal";
import { DbService } from "../db/db.service";
import { UsersService } from "../users/users.service";
import { CreateIncidentDto, ListIncidentsDto, RecordNotificationDto, UpdateIncidentDto } from "./security-incidents.dto";

const FIELDS: Record<string,string> = {
  status:"status", severity:"severity", personalDataBreach:"personal_data_breach",
  rightsAffected:"rights_affected", regulatorNotification:"regulator_notification",
  containmentActions:"containment_actions", finalReport:"final_report",
  investigatorUserId:"investigator_user_id", affectedUsersEstimate:"affected_users_estimate",
  affectedSystems:"affected_systems", affectedDataCategories:"affected_data_categories",
};
const NEXT: Record<string,string[]> = {
  detected:["triage","contained"], triage:["contained","investigating"],
  contained:["investigating","resolved"], investigating:["contained","resolved"],
  resolved:["investigating","closed"], closed:[],
};

@Injectable()
export class SecurityIncidentsService {
  constructor(private readonly db:DbService, private readonly users:UsersService) {}

  private async admin(principal:Principal) {
    if (!principal?.roles?.includes("admin")) throw new ForbiddenException("Admin role required");
    const user = await this.users.ensureAccount(principal);
    const {rows}=await this.db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'",[user.id]);
    if (!rows.length) throw new ForbiddenException("Admin role required");
    return user.id as string;
  }

  private async fetch(id:string) {
    const {rows}=await this.db.query("SELECT * FROM security_incidents WHERE id=$1",[id]);
    if (!rows.length) throw new NotFoundException("Incident not found");
    return rows[0];
  }

  private publicIncident(row:any) {
    const required=row.personal_data_breach==="confirmed" && row.rights_affected===true;
    const since=new Date(row.detected_at).getTime();
    return {
      id:row.id, incidentType:row.incident_type, title:row.title, description:row.description,
      detectedAt:row.detected_at, occurredAt:row.occurred_at,
      affectedSystems:row.affected_systems, affectedDataCategories:row.affected_data_categories,
      affectedUsersEstimate:row.affected_users_estimate, severity:row.severity,status:row.status,
      personalDataBreach:row.personal_data_breach,rightsAffected:row.rights_affected,
      investigatorUserId:row.investigator_user_id,createdByUserId:row.created_by_user_id,
      containmentActions:row.containment_actions,finalReport:row.final_report,
      regulatorNotification:row.regulator_notification,initialNotifiedAt:row.initial_notified_at,
      finalNotifiedAt:row.final_notified_at,initialReference:row.initial_reference,
      finalReference:row.final_reference,resolvedAt:row.resolved_at,closedAt:row.closed_at,
      createdAt:row.created_at,updatedAt:row.updated_at,
      notificationAssessmentRequired:required,
      initialDeadline:required?new Date(since+24*3600*1000).toISOString():null,
      finalDeadline:required?new Date(since+72*3600*1000).toISOString():null,
      initialOverdue:required&&!row.initial_notified_at&&Date.now()>since+24*3600*1000,
      finalOverdue:required&&!row.final_notified_at&&Date.now()>since+72*3600*1000,
    };
  }

  async list(principal:Principal,query:ListIncidentsDto) {
    await this.admin(principal);
    const {rows}=await this.db.query(
      "SELECT * FROM security_incidents WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR severity=$2) ORDER BY detected_at DESC,id DESC LIMIT $3",
      [query.status??null,query.severity??null,query.limit??100]);
    return rows.map(row=>this.publicIncident(row));
  }

  async get(principal:Principal,id:string) {
    await this.admin(principal);
    const incident=await this.fetch(id);
    const {rows}=await this.db.query("SELECT id,actor_user_id,action,event_at,details FROM security_incident_events WHERE incident_id=$1 ORDER BY id DESC LIMIT 300",[id]);
    return {...this.publicIncident(incident),events:rows};
  }

  async create(principal:Principal,body:CreateIncidentDto) {
    const actor=await this.admin(principal);
    const detected=body.detectedAt?new Date(body.detectedAt):new Date();
    if (detected.getTime()>Date.now()+60000) throw new BadRequestException("Detection cannot be in the future");
    const result=await this.db.tx(async c=>{
      const {rows}=await c.query(
        "INSERT INTO security_incidents(incident_type,title,description,severity,detected_at,occurred_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [body.incidentType,body.title.trim(),body.description??"",body.severity,detected,body.occurredAt??null,actor]);
      await c.query("INSERT INTO security_incident_events(incident_id,actor_user_id,action,details) VALUES($1,$2,'created',$3::jsonb)",[rows[0].id,actor,JSON.stringify({severity:body.severity,incidentType:body.incidentType})]);
      return rows[0];
    });
    return this.publicIncident(result);
  }

  async update(principal:Principal,id:string,body:UpdateIncidentDto) {
    const actor=await this.admin(principal);
    const entries=Object.entries(body).filter(([key,value])=>FIELDS[key]&&value!==undefined);
    if (!entries.length) throw new BadRequestException("No changes");
    if (entries.some(([key])=>key==="regulatorNotification"&&["initial_submitted","final_submitted"].includes(body.regulatorNotification??"")))
      throw new BadRequestException("Use notification evidence endpoint");
    const updated=await this.db.tx(async c=>{
      const {rows}=await c.query("SELECT * FROM security_incidents WHERE id=$1 FOR UPDATE",[id]);
      if (!rows.length) throw new NotFoundException("Incident not found");
      const old=rows[0];
      if (old.status==="closed") throw new BadRequestException("Closed incidents are read-only");
      if (body.status && body.status!==old.status && !NEXT[old.status]?.includes(body.status)) throw new BadRequestException("Invalid status transition");
      if (body.status==="closed" && !old.final_report && !body.finalReport) throw new BadRequestException("Final report is required to close");
      const breach=body.personalDataBreach??old.personal_data_breach;
      const rights=body.rightsAffected??old.rights_affected;
      if (body.status==="closed" && breach==="confirmed" && rights===true && !old.final_notified_at)
        throw new BadRequestException("Final notification evidence is required before closure");
      let notification=body.regulatorNotification??old.regulator_notification;
      if (!old.initial_notified_at && body.regulatorNotification===undefined) {
        if (breach==="confirmed"&&rights===true) notification="required";
        else if (notification==="required") notification="not_assessed";
      }
      if (["required","initial_submitted","final_submitted"].includes(notification) && !(breach==="confirmed"&&rights===true))
        throw new BadRequestException("Confirmed breach affecting rights is required");
      if (breach==="confirmed"&&rights===true&&notification==="not_required")
        throw new BadRequestException("Notification cannot be marked not required");
      if (old.initial_notified_at && notification!=="initial_submitted" && notification!=="final_submitted")
        throw new BadRequestException("Cannot alter recorded submission evidence");
      const setters=entries.map(([key],i)=>FIELDS[key]+"=$"+(i+2));
      const values=entries.map(([,value])=>value);
      if (notification!==old.regulator_notification && body.regulatorNotification===undefined) {
        setters.push("regulator_notification=$"+(values.length+2));
        values.push(notification);
      }
      if(body.status==="resolved") setters.push("resolved_at=now()");
      if(body.status==="closed") setters.push("closed_at=now()");
      setters.push("updated_at=now()");
      const {rows:next}=await c.query("UPDATE security_incidents SET "+setters.join(",")+" WHERE id=$1 RETURNING *",[id,...values]);
      await c.query("INSERT INTO security_incident_events(incident_id,actor_user_id,action,details) VALUES($1,$2,'updated',$3::jsonb)",[id,actor,JSON.stringify({fields:entries.map(([key])=>key),status:body.status??null})]);
      return next[0];
    });
    return this.publicIncident(updated);
  }

  async recordNotification(principal:Principal,id:string,body:RecordNotificationDto) {
    const actor=await this.admin(principal);
    const time=body.submittedAt?new Date(body.submittedAt):new Date();
    if(time.getTime()>Date.now()+60000) throw new BadRequestException("Future submission time");
    const updated=await this.db.tx(async c=>{
      const {rows}=await c.query("SELECT * FROM security_incidents WHERE id=$1 FOR UPDATE",[id]);
      if(!rows.length) throw new NotFoundException("Incident not found");
      const old=rows[0];
      if(old.status==="closed") throw new BadRequestException("Closed incidents are read-only");
      if(old.personal_data_breach!=="confirmed"||!old.rights_affected) throw new BadRequestException("Confirmed personal data breach required");
      if (time.getTime()<new Date(old.detected_at).getTime()) throw new BadRequestException("Submission cannot predate detection");
      if(body.kind==="initial"&&old.initial_notified_at) throw new BadRequestException("Initial notification already recorded");
      if(body.kind==="final"&&(!old.initial_notified_at||old.final_notified_at)) throw new BadRequestException("Initial notice must precede final notice");
      if(body.kind==="final"&&time.getTime()<new Date(old.initial_notified_at).getTime()) throw new BadRequestException("Final notification cannot predate initial");
      const fields=body.kind==="initial"
        ?"initial_notified_at=$2,initial_reference=$3,regulator_notification='initial_submitted'"
        :"final_notified_at=$2,final_reference=$3,regulator_notification='final_submitted'";
      const {rows:next}=await c.query("UPDATE security_incidents SET "+fields+",updated_at=now() WHERE id=$1 RETURNING *",[id,time,body.reference.trim()]);
      await c.query("INSERT INTO security_incident_events(incident_id,actor_user_id,action,details) VALUES($1,$2,$3,$4::jsonb)",
        [id,actor,body.kind+"_notification_recorded",JSON.stringify({reference:body.reference.trim(),submittedAt:time.toISOString()})]);
      return next[0];
    });
    return this.publicIncident(updated);
  }
}
