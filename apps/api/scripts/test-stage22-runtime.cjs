"use strict";
// Isolated PostgreSQL integration test; uses only synthetic patients.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { DbService } = require("../dist/db/db.service.js");
const { MonitoringService } = require("../dist/monitoring/monitoring.service.js");

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("medicare_check") || !url.includes("55434")) {
    throw new Error("Refusing to run outside isolated medicare_check:55434 database");
  }
  const db = new DbService();
  const tag = randomUUID().slice(0, 8);
  const principal=(sub,roles)=>({sub,roles,amr:[]});
  const userIds={};
  const users={ensureAccount:async p=>({id:userIds[p.sub]})};
  const audit={record:async()=>{}};
  const service=new MonitoringService(db,users,audit);
  try {
    for (const name of ["doctor","otherDoctor","patient","outsider"]) {
      const {rows:[u]}=await db.query("INSERT INTO app_users(identity_subject) VALUES($1) RETURNING id",["stage22-"+name+"-"+tag]);
      userIds[name]=u.id;
    }
    for(const name of ["doctor","otherDoctor"]) {
      await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'doctor')",[userIds[name]]);
    }
    const {rows:[doctor]}=await db.query("INSERT INTO doctor_profiles(account_user_id,slug,full_name,verified) VALUES($1,$2,'Test doctor',true) RETURNING id",[userIds.doctor,"stage22-dr-"+tag]);
    const {rows:[otherDoctor]}=await db.query("INSERT INTO doctor_profiles(account_user_id,slug,full_name,verified) VALUES($1,$2,'Other doctor',true) RETURNING id",[userIds.otherDoctor,"stage22-other-"+tag]);
    const {rows:[patient]}=await db.query("INSERT INTO patient_profiles(owner_user_id,full_name) VALUES($1,'Synthetic patient') RETURNING id",[userIds.patient]);
    const {rows:[otherPatient]}=await db.query("INSERT INTO patient_profiles(owner_user_id,full_name) VALUES($1,'Other synthetic patient') RETURNING id",[userIds.outsider]);
    const created=await service.createProgram(principal("doctor",["doctor"]),{title:"Stage 22 integration "+tag});
    const {rows:[enrollment]}=await db.query(
      "INSERT INTO patient_monitoring_enrollments(program_id,patient_profile_id,doctor_id,created_by_user_id) VALUES($1,$2,$3,$4) RETURNING id",
      [created.id,patient.id,doctor.id,userIds.doctor]
    );
    const threshold=await service.createThreshold(principal("doctor",["doctor"]),created.id,{metric:"pulse",maxValue:100,severity:"critical"});
    await assert.rejects(
      ()=>service.createThreshold(principal("otherDoctor",["doctor"]),created.id,{metric:"pulse",maxValue:110,severity:"warning"}),
      /Only the active program owner/
    );
    const {rows:[foreignDevice]}=await db.query(
      "INSERT INTO medical_devices(patient_profile_id,device_type) VALUES($1,'pulse') RETURNING id",
      [otherPatient.id],
    );
    await assert.rejects(
      ()=>service.createMeasurement(principal("patient",["patient"]),{
        enrollmentId:enrollment.id,deviceId:foreignDevice.id,metric:"pulse",value:120
      }),/Device does not belong/
    );
    const abnormal=await service.createMeasurement(principal("patient",["patient"]),{
      enrollmentId:enrollment.id,metric:"pulse",value:120,
    });
    assert.equal(abnormal.alertSeverity,"critical");
    const {rows:[alertCheck]}=await db.query(
      "SELECT count(*)::int AS n FROM clinical_alerts WHERE enrollment_id=$1 AND measurement_id=$2 AND threshold_id=$3",
      [enrollment.id,abnormal.measurementId,threshold.id]
    );
    assert.equal(alertCheck.n,1);
    const normal=await service.createMeasurement(principal("patient",["patient"]),{
      enrollmentId:enrollment.id,metric:"pulse",value:70,
    });
    assert.equal(normal.alertSeverity,null);
    await assert.rejects(
      ()=>service.listMeasurements(principal("outsider",["patient"]),enrollment.id),
      /Not a participant/
    );
    const visible=await service.listMeasurements(principal("patient",["patient"]),enrollment.id);
    assert.equal(visible.length,2);
    console.log(JSON.stringify({result:"PASS",tag,abnormalMeasurement:abnormal.measurementId,alertCount:alertCheck.n,visibleMeasurements:visible.length,rbacChecks:2}));
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
