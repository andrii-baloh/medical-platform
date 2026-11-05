"use strict";
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {DbService}=require("../dist/db/db.service.js");
const {PaymentsService}=require("../dist/payments/payments.service.js");

async function main(){
  const url=process.env.DATABASE_URL||"";
  if(!url.includes("medicare_check")||!url.includes("55434"))
    throw new Error("Only isolated medicare_check database allowed");
  const db=new DbService();
  const tag=randomUUID().slice(0,8);
  try{
    const {rows:[actor]}=await db.query(
      "insert into app_users(identity_subject) values($1) returning id",["payment-runtime-"+tag]);
    const {rows:[doctor]}=await db.query(
      "insert into doctor_profiles(account_user_id,slug,full_name,verified) values($1,$2,'Synthetic Doctor',true) returning id",
      [actor.id,"payment-runtime-"+tag]);
    const {rows:[patient]}=await db.query(
      "insert into patient_profiles(owner_user_id,full_name) values($1,'Synthetic Patient') returning id",[actor.id]);
    const {rows:[slot]}=await db.query(
      "insert into appointment_slots(doctor_id,starts_at,ends_at,price_minor,currency) values($1,now()+interval '2 days',now()+interval '2 days 30 minutes',10000,'RUB') returning id",[doctor.id]);
    const {rows:[appointment]}=await db.query(
      "insert into appointments(slot_id,doctor_id,patient_profile_id,created_by_user_id,patient_timezone,price_minor,currency) values($1,$2,$3,$4,'Europe/Moscow',10000,'RUB') returning id",
      [slot.id,doctor.id,patient.id,actor.id]);
    const providerPaymentId="runtime-"+tag;
    const {rows:[payment]}=await db.query(
      "insert into payments(appointment_id,provider,provider_payment_id,status,amount_minor,currency) values($1,'development',$2,'created',10000,'RUB') returning id",
      [appointment.id,providerPaymentId]);
    const provider={
      name:"development",
      async verifyWebhook(_signature,body){return {
        providerEventId:body.eventId,
        providerPaymentId,
        eventType:"test.status."+body.status,
        status:body.status
      };},
    };
    const service=new PaymentsService(db,{}, {record:async()=>{}},provider);
    const send=async(eventId,status)=>service.processWebhook("test-only", {eventId,status});
    const first=await send("paid-"+tag,"paid");
    assert.equal(first.duplicate,false);
    let current=await db.query("select status,paid_at from payments where id=$1",[payment.id]);
    assert.equal(current.rows[0].status,"paid");
    assert.ok(current.rows[0].paid_at);
    const late=await send("late-failed-"+tag,"failed");
    assert.equal(late.duplicate,true);
    current=await db.query("select status from payments where id=$1",[payment.id]);
    assert.equal(current.rows[0].status,"paid");
    const again=await send("paid-"+tag,"paid");
    assert.equal(again.duplicate,true);
    const {rows:[counts]}=await db.query(
      "select (select count(*)::int from payment_events where payment_id=$1) events,(select count(*)::int from outbox_events where aggregate_type='payment' and aggregate_id=$1) outbox",
      [payment.id]);
    assert.equal(counts.events,2);
    assert.equal(counts.outbox,1);
    console.log(JSON.stringify({result:"PASS",tag,paymentStatus:"paid",webhookEvents:counts.events,outboxEvents:counts.outbox,lateFailedIgnored:true}));
  }finally{await db.onModuleDestroy();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
