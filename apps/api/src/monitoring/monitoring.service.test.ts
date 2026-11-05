import { describe, expect, it, vi } from "vitest";
import { MonitoringService } from "./monitoring.service";
import type { Principal } from "../auth/principal";
import type { DbService } from "../db/db.service";
import type { UsersService } from "../users/users.service";
import type { AuditService } from "../audit/audit.service";

const doctor: Principal = { sub:"dr",roles:["doctor"],amr:[] };
const patient: Principal = { sub:"patient",roles:["patient"],amr:[] };

function setup(userId="doctor-user") {
  const db={query:vi.fn(),tx:vi.fn()};
  const users={ensureAccount:vi.fn().mockResolvedValue({id:userId})};
  const audit={record:vi.fn()};
  const service=new MonitoringService(db as unknown as DbService,users as unknown as UsersService,audit as unknown as AuditService);
  return {service,db,audit};
}

describe("Stage 22 access controls",()=>{
  it("rejects a verified doctor editing another doctor's program thresholds",async()=>{
    const {service,db}=setup();
    db.query
      .mockResolvedValueOnce({rows:[{id:"doctor-id",verified:true,organization_id:null}]})
      .mockResolvedValueOnce({rows:[{id:"program-id",created_by_user_id:"other-doctor",active:true}]});
    await expect(service.createThreshold(doctor,"program-id",{metric:"pulse",maxValue:120,severity:"warning"}))
      .rejects.toThrow("Only the active program owner");
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it("rejects another patient's device before writing a measurement",async()=>{
    const {service,db,audit}=setup("patient-user");
    db.query.mockResolvedValue({rows:[{
      id:"enrollment-id",program_id:"program-id",patient_profile_id:"patient-one",
      doctor_id:"doctor-id",status:"active",doctor_user_id:"doctor-user",
      patient_owner_user_id:"patient-user",
    }]});
    const client={query:vi.fn()
      .mockResolvedValueOnce({rows:[{id:"enrollment-id"}]})
      .mockResolvedValueOnce({rows:[]})};
    db.tx.mockImplementation(async(fn:(connection:{query:typeof client.query})=>Promise<unknown>)=>fn(client));
    await expect(service.createMeasurement(patient,{
      enrollmentId:"enrollment-id",deviceId:"foreign-device",metric:"pulse",value:75
    })).rejects.toThrow("Device does not belong");
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("denies a former doctor with a revoked local role",async()=>{
    const {service,db}=setup("doctor-user");
    db.query
      .mockResolvedValueOnce({rows:[{
        id:"enrollment-id",program_id:"program-id",patient_profile_id:"patient-one",
        doctor_id:"doctor-id",status:"active",doctor_user_id:"doctor-user",
        patient_owner_user_id:"patient-user",
      }]})
      .mockResolvedValueOnce({rows:[]});
    await expect(service.listMeasurements(doctor,"enrollment-id"))
      .rejects.toThrow("Doctor role has been revoked");
  });

  it("rejects a paused enrollment when locked inside the transaction",async()=>{
    const {service,db}=setup("patient-user");
    db.query.mockResolvedValue({rows:[{
      id:"enrollment-id",program_id:"program-id",patient_profile_id:"patient-one",
      doctor_id:"doctor-id",status:"active",doctor_user_id:"doctor-user",
      patient_owner_user_id:"patient-user",
    }]});
    const client={query:vi.fn().mockResolvedValue({rows:[]})};
    db.tx.mockImplementation(async(fn:(connection:{query:typeof client.query})=>Promise<unknown>)=>fn(client));
    await expect(service.createMeasurement(patient,{
      enrollmentId:"enrollment-id",metric:"pulse",value:80
    })).rejects.toThrow("Enrollment is not active");
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
