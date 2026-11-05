"use strict";
// Isolated database integration test. Never point at production databases.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { DbService } = require("../dist/db/db.service.js");
const { SecurityIncidentsService } = require("../dist/security-incidents/security-incidents.service.js");

async function main() {
  const connection = process.env.DATABASE_URL || "";
  if (!connection.includes("medicare_check") || !connection.includes("55434")) {
    throw new Error("Refusing to test outside isolated medicare_check database on port 55434");
  }
  const db = new DbService();
  try {
    const subject = "stage21-runtime-test-" + randomUUID();
    const {rows:[actor]} = await db.query(
      "INSERT INTO app_users(identity_subject) VALUES($1) RETURNING id",
      [subject],
    );
    await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'admin')",[actor.id]);
    const users = {ensureAccount: async()=>({id:actor.id})};
    const service = new SecurityIncidentsService(db,users);
    const principal = {sub:subject,roles:["admin"],amr:[]};
    const forbidden = {sub:subject,roles:["patient"],amr:[]};
    await assert.rejects(()=>service.list(forbidden,{}),/Admin role required/);

    const incident = await service.create(principal,{
      title:"Stage 21 integration test",incidentType:"data_disclosure",severity:"high",
    });
    assert.equal(incident.status,"detected");
    assert.equal(incident.personalDataBreach,"undetermined");

    const reportable = await service.update(principal,incident.id,{
      personalDataBreach:"confirmed",rightsAffected:true,
    });
    assert.equal(reportable.regulatorNotification,"required");
    assert.ok(reportable.initialDeadline && reportable.finalDeadline);

    await assert.rejects(
      ()=>service.update(principal,incident.id,{status:"closed"}),
      /Invalid status transition/,
    );
    for(const status of ["triage","contained","investigating","resolved"]) {
      await service.update(principal,incident.id,{status});
    }
    await service.update(principal,incident.id,{finalReport:"Isolated test: no patient data"});

    await assert.rejects(
      ()=>service.update(principal,incident.id,{status:"closed"}),
      /Final notification evidence is required/,
    );
    const initial = await service.recordNotification(principal,incident.id,{
      kind:"initial",reference:"TEST-INITIAL-"+subject,
    });
    assert.equal(initial.regulatorNotification,"initial_submitted");
    await assert.rejects(
      ()=>service.recordNotification(principal,incident.id,{kind:"initial",reference:"TEST-DUPLICATE"}),
      /already recorded/,
    );
    const final = await service.recordNotification(principal,incident.id,{
      kind:"final",reference:"TEST-FINAL-"+subject,
    });
    assert.equal(final.regulatorNotification,"final_submitted");
    const closed = await service.update(principal,incident.id,{status:"closed"});
    assert.equal(closed.status,"closed");
    await assert.rejects(()=>service.update(principal,incident.id,{severity:"low"}),/read-only/);

    const detail=await service.get(principal,incident.id);
    assert.ok(detail.events.length>=8);
    const {rows:[audit]}=await db.query(
      "SELECT count(*)::int AS total FROM audit_events WHERE resource_type='security_incident' AND resource_id=$1",
      [incident.id],
    );
    assert.ok(audit.total>=8, "audit_events must contain all mutations");
    console.log(JSON.stringify({result:"PASS",incidentId:incident.id,events:detail.events.length,auditEvents:audit.total,status:closed.status}));
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
