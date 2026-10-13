import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

class ClinicalEntryBaseDto {
  @IsUUID() sourceEncounterId!: string;
}

export class CreateDiagnosisDto extends ClinicalEntryBaseDto {
  @IsOptional() @IsString() @MaxLength(120) code?: string;
  @IsOptional() @IsString() @MaxLength(120) codeSystem?: string;
  @IsString() @MaxLength(1000) display!: string;
  @IsOptional() @IsIn(["active", "resolved", "entered_in_error"]) clinicalStatus?: string;
  @IsOptional() @IsDateString() diagnosedAt?: string;
}

export class CreateAllergyDto extends ClinicalEntryBaseDto {
  @IsString() @MaxLength(1000) allergen!: string;
  @IsOptional() @IsString() @MaxLength(4000) reaction?: string;
  @IsOptional() @IsIn(["mild", "moderate", "severe", "unknown"]) severity?: string;
  @IsOptional() @IsIn(["active", "inactive", "entered_in_error"]) clinicalStatus?: string;
}

export class CreateMedicationDto extends ClinicalEntryBaseDto {
  @IsString() @MaxLength(1000) medicationName!: string;
  @IsOptional() @IsString() @MaxLength(1000) dosage?: string;
  @IsOptional() @IsString() @MaxLength(500) route?: string;
  @IsOptional() @IsString() @MaxLength(1000) frequency?: string;
  @IsOptional() @IsIn(["active", "stopped", "completed", "entered_in_error"]) clinicalStatus?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
}

export class CreateRecordTestDto extends ClinicalEntryBaseDto {
  @IsOptional() @IsString() @MaxLength(120) testCode?: string;
  @IsString() @MaxLength(1000) testName!: string;
  @IsOptional() @IsIn(["ordered", "resulted", "cancelled", "entered_in_error"]) status?: string;
  @IsOptional() @IsString() @MaxLength(20000) resultText?: string;
  @IsOptional() @IsDateString() resultedAt?: string;
}
