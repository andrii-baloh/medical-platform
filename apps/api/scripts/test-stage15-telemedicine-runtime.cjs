"use strict";
// Exercise the actual Stage 15 PostgreSQL transaction methods with synthetic data.
const assert = require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {DbService}=require("../dist/db/db.service.js");
const {TelemedicineService}=require("../dist/telemedicine/telemedicine.service.js");

async function main(){
  const url=process.env.DATABASE_URL||"";
  if(!url.includes("medicare_check")||!url.includes("55434"))
    throw new Error("Only isolated medicare_check database allowed");
  const db=new DbService();
  const tag=randomUUID().slice(0,8);
  try {
    const {rows:[doctorUser]}=await db.query("insert into app_users(identity_subject) values($1) returning id",["stage15-doctor-"+tag]);
    const {rows:[patientUser]}=await db.query("insert into app_users(identity_subject) values($1) returning id",["stage15-patient-"+tag]);
    const {rows:[outsiderUser]}=await db.query("insert into app_users(identity_subject) values($1) returning id",["stage15-outsider-"+tag]);
    const {rows:[doctor]}=await db.query(
      "insert into doctor_profiles(account_user_id,slug,full_name,verified) values($1,$2,'Stage 15 Test Doctor',true) returning id",
      [doctorUser.id,"stage15-dr-"+tag]);
    const {rows:[patient]}=await db.query(
      "insert into patient_profiles(owner_user_id,full_name) values($1,'Stage 15 Test Patient') returning id",
      [patientUser.id]);
    const {rows:[slot]}=await db.query(
      "insert into appointment_slots(doctor_id,starts_at,ends_at,price_minor,currency) values($1,now()+interval '3 days',now()+interval '3 days 30 minutes',10000,'RUB') returning id",[doctor.id]);
    const {rows:[appointment]}=await db.query(
      "insert into appointments(slot_id,doctor_id,patient_profile_id,created_by_user_id,patient_timezone,price_minor,currency) values($1,$2,$3,$4,'Europe/Moscow',10000,'RUB') returning id",
      [slot.id,doctor.id,patient.id,patientUser.id]);
    const {rows:[room]}=await db.query(
      "insert into video_rooms(appointment_id,provider,provider_room_id,room_name) values($1,'livekit',$2,$3) returning id",
      [appointment.id,"test-room-"+tag,"test-room-"+tag]);
    const userLookup={
      "doctor":doctorUser.id,"patient":patientUser.id,"outsider":outsiderUser.id,
    };
    const service=new TelemedicineService(db,{ensureAccount:async principal=>({id:userLookup[principal.sub]})},{record:async()=>{}});
    let session;
    await db.tx(async client=>{
      session=await service.ensureForRoomTx(client,{appointmentId:appointment.id,videoRoomId:room.id,provider:"livekit"});
      await service.markRoomOpenedTx(client,session.id,doctorUser.id);
      await service.recordParticipantEventTx(client,session.id,"doctor","joined",doctorUser.id);
      await service.recordParticipantEventTx(client,session.id,"patient","joined",patientUser.id);
      await service.recordParticipantEventTx(client,session.id,"patient","connection_lost",patientUser.id);
      await service.recordParticipantEventTx(client,session.id,"patient","reconnecting",patientUser.id);
      await service.recordParticipantEventTx(client,session.id,"patient","joined",patientUser.id);
      await service.recordParticipantEventTx(client,session.id,"doctor","left",doctorUser.id);
    });
    const second=await db.tx(client=>service.ensureForRoomTx(client,{appointmentId:appointment.id,videoRoomId:room.id,provider:"livekit"}));
    assert.equal(second.id,session.id,"session creation must be idempotent");
    const view=await service.getForAppointment({sub:"patient",roles:["patient"],amr:[]},appointment.id);
    assert.equal(view.status,"active");
    assert.equal(view.disconnectCount,1);
    assert.ok(view.patientJoinedAt&&view.doctorJoinedAt);
    assert.equal(view.provider,"livekit");
    await assert.rejects(
      ()=>service.getForAppointment({sub:"outsider",roles:["patient"],amr:[]},appointment.id),
      /Not a participant/,
    );
    await db.tx(client=>service.completeForAppointmentTx(client,appointment.id,"completed"));
    const done=await service.getForAppointment({sub:"patient",roles:["patient"],amr:[]},appointment.id);
    assert.equal(done.status,"completed");
    assert.ok(done.endedAt);
    const {rows:[events]}=await db.query("select count(*)::int n from telemedicine_session_events where session_id=$1",[session.id]);
    assert.ok(events.n>=8);
    console.log(JSON.stringify({result:"PASS",tag,status:done.status,disconnectCount:done.disconnectCount,eventCount:events.n,idempotent:true,deniedOutsider:true}));
  }finally{await db.onModuleDestroy();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
