import { describe, expect, it, vi } from "vitest";
import { SecurityIncidentsService } from "./security-incidents.service";
import type { DbService } from "../db/db.service";
import type { UsersService } from "../users/users.service";
import type { Principal } from "../auth/principal";

const administrator:Principal={sub:"test-subject",roles:["admin"],amr:[]};
const noAdmin:Principal={sub:"test-subject",roles:["patient"],amr:[]};
const detectedAt="2026-10-01T10:00:00.000Z";

function createService() {
  const db={query:vi.fn(),tx:vi.fn()};
  const users={ensureAccount:vi.fn().mockResolvedValue({id:"00000000-0000-4000-8000-000000000001"})};
  const service=new SecurityIncidentsService(db as unknown as DbService, users as unknown as UsersService);
  return {db,users,service};
}
describe("SecurityIncidentsService",()=>{
  it("denies users without administrator role before accessing the database",async()=>{
    const {db,users,service}=createService();
    await expect(service.list(noAdmin,{})).rejects.toThrow("Admin role required");
    expect(users.ensureAccount).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("requires local administrator role even if OIDC carries admin role",async()=>{
    const {db,service}=createService();
    db.query.mockResolvedValue({rows:[]});
    await expect(service.list(administrator,{})).rejects.toThrow("Admin role required");
  });

  it("calculates 24h and 72h deadlines for confirmed personal-data breaches",async()=>{
    const {db,service}=createService();
    db.query
      .mockResolvedValueOnce({rows:[{ok:1}]})
      .mockResolvedValueOnce({rows:[{
        id:"123",incident_type:"data_disclosure",title:"test",description:"",
        detected_at:new Date(detectedAt),affected_systems:[],affected_data_categories:[],
        personal_data_breach:"confirmed",rights_affected:true,
        severity:"high",status:"investigating",regulator_notification:"required"
      }]})
      .mockResolvedValueOnce({rows:[]});
    const result=await service.get(administrator,"123");
    expect(result.initialDeadline).toBe("2026-10-02T10:00:00.000Z");
    expect(result.finalDeadline).toBe("2026-10-04T10:00:00.000Z");
    expect(result.initialOverdue).toBe(true);
    expect(result.finalOverdue).toBe(true);
  });

  it("rejects invalid incident state transitions inside the transaction",async()=>{
    const {db,service}=createService();
    db.query.mockResolvedValue({rows:[{ok:1}]});
    const client={query:vi.fn().mockResolvedValue({rows:[{
      status:"detected",personal_data_breach:"undetermined",
      rights_affected:false,regulator_notification:"not_assessed"
    }]})};
    db.tx.mockImplementation(async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client));
    await expect(service.update(administrator,"123",{status:"closed"})).rejects.toThrow("Invalid status transition");
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("does not allow recording notifications without a confirmed rights-affecting breach",async()=>{
    const {db,service}=createService();
    db.query.mockResolvedValue({rows:[{ok:1}]});
    const client={query:vi.fn().mockResolvedValue({rows:[{
      personal_data_breach:"undetermined",rights_affected:false,detected_at:new Date(detectedAt)
    }]})};
    db.tx.mockImplementation(async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client));
    await expect(service.recordNotification(administrator,"123",{kind:"initial",reference:"RKN-TEST"}))
      .rejects.toThrow("Confirmed personal data breach required");
  });

  it("automatically marks a confirmed rights-affecting breach as reportable",async()=>{
    const {db,service}=createService();
    db.query.mockResolvedValue({rows:[{ok:1}]});
    const old={
      status:"investigating",detected_at:new Date(detectedAt),
      personal_data_breach:"undetermined",rights_affected:false,
      regulator_notification:"not_assessed",
    };
    const client={query:vi.fn().mockImplementation(async(sql:string)=>{
      if(sql.startsWith("SELECT")) return {rows:[old]};
      if(sql.startsWith("UPDATE")) return {rows:[{...old,personal_data_breach:"confirmed",rights_affected:true,regulator_notification:"required"}]};
      return {rows:[]};
    })};
    db.tx.mockImplementation(async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client));
    const result=await service.update(administrator,"123",{personalDataBreach:"confirmed",rightsAffected:true});
    expect(result.regulatorNotification).toBe("required");
    const updateCall=client.query.mock.calls.find((call)=>String(call[0]).startsWith("UPDATE"));
    expect(updateCall?.[0]).toContain("regulator_notification=");
    expect(updateCall?.[1]).toContain("required");
  });

  it("prevents closure of reportable incidents without final notification evidence",async()=>{
    const {db,service}=createService();
    db.query.mockResolvedValue({rows:[{ok:1}]});
    const client={query:vi.fn().mockResolvedValue({rows:[{
      status:"resolved",final_report:"Finished",personal_data_breach:"confirmed",
      rights_affected:true,regulator_notification:"initial_submitted",final_notified_at:null,
    }]})};
    db.tx.mockImplementation(async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client));
    await expect(service.update(administrator,"123",{status:"closed"}))
      .rejects.toThrow("Final notification evidence is required before closure");
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
