import { describe, expect, it, vi } from "vitest";
import type { Principal } from "../auth/principal";
import type { DbService } from "../db/db.service";
import type { UsersService } from "../users/users.service";
import type { AuditService } from "../audit/audit.service";
import { RetentionService } from "./retention.service";

const admin: Principal={sub:"admin-user",roles:["admin"],amr:[]};
const patient: Principal={sub:"patient-user",roles:["patient"],amr:[]};
function setup() {
  const db={query:vi.fn(),tx:vi.fn()};
  const users={ensureAccount:vi.fn().mockResolvedValue({id:"actor-id"})};
  const audit={record:vi.fn().mockResolvedValue(undefined)};
  return {db,users,audit,service:new RetentionService(db as unknown as DbService,users as unknown as UsersService,audit as unknown as AuditService)};
}

describe("Stage 17 legal holds",()=>{
  it("denies creation to non-administrators before database queries",async()=>{
    const {db,service}=setup();
    await expect(service.createLegalHold(patient,"medical_documents","Litigation retention hold"))
      .rejects.toThrow("Admin role required");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("records a hold only after local admin authorization",async()=>{
    const {db,audit,service}=setup();
    db.query.mockResolvedValueOnce({rows:[{ok:1}]}).mockResolvedValueOnce({rows:[{id:"hold-id"}]});
    const result=await service.createLegalHold(admin,"medical_documents","Regulator investigation requires preservation");
    expect(result).toEqual({id:"hold-id",dataClass:"medical_documents",active:true});
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action:"retention.legal_hold.create",resourceId:"hold-id",
    }));
  });

  it("requires a documented reason before releasing a legal hold",async()=>{
    const {db,service}=setup();
    db.query.mockResolvedValue({rows:[{ok:1}]});
    await expect(service.releaseLegalHold(admin,"hold-id","ok"))
      .rejects.toThrow("Release reason must be at least 10 characters");
  });

  it("blocks a scheduled deletion when a hold is active",async()=>{
    const {db,service}=setup();
    db.query
      .mockResolvedValueOnce({rows:[{
        id:"policy-id",data_class:"medical_documents",retention_days:365,
        action:"soft_delete",legal_basis:"Approved test policy",active:true,
      }]})
      .mockResolvedValueOnce({rows:[{hold:1}]});
    await expect(service.executeScheduled("medical_documents"))
      .rejects.toThrow("Retention legal hold is active");
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
