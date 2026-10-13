import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { CreateAllergyDto, CreateDiagnosisDto, CreateMedicationDto, CreateRecordTestDto } from "./medical-record.dto";
import { MedicalRecordsService } from "./medical-records.service";

@Controller("medical-records")
export class MedicalRecordsController {
  constructor(private readonly records: MedicalRecordsService) {}

  @Get("patient/:patientId")
  get(@CurrentPrincipal() principal: Principal, @Param("patientId") patientId: string) {
    return this.records.get(principal, patientId);
  }

  @Post("patient/:patientId/diagnoses")
  addDiagnosis(@CurrentPrincipal() principal: Principal, @Param("patientId") patientId: string, @Body() body: CreateDiagnosisDto) {
    return this.records.addDiagnosis(principal, patientId, body);
  }

  @Post("patient/:patientId/allergies")
  addAllergy(@CurrentPrincipal() principal: Principal, @Param("patientId") patientId: string, @Body() body: CreateAllergyDto) {
    return this.records.addAllergy(principal, patientId, body);
  }

  @Post("patient/:patientId/medications")
  addMedication(@CurrentPrincipal() principal: Principal, @Param("patientId") patientId: string, @Body() body: CreateMedicationDto) {
    return this.records.addMedication(principal, patientId, body);
  }

  @Post("patient/:patientId/tests")
  addTest(@CurrentPrincipal() principal: Principal, @Param("patientId") patientId: string, @Body() body: CreateRecordTestDto) {
    return this.records.addTest(principal, patientId, body);
  }
}
