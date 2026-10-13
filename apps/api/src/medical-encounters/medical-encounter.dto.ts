import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export const ENCOUNTER_TYPES = [
  "primary_remote",
  "followup_remote",
  "offline_reference",
  "monitoring",
  "consultation_review",
] as const;

export const ENCOUNTER_STATUSES = [
  "scheduled",
  "waiting",
  "active",
  "completed",
  "cancelled",
  "no_show",
  "requires_offline_visit",
] as const;

export class CreateStandaloneEncounterDto {
  @IsUUID() patientProfileId!: string;
  @IsIn(["offline_reference", "monitoring", "consultation_review"])
  encounterType!: "offline_reference" | "monitoring" | "consultation_review";
  @IsOptional() @IsString() @MaxLength(40000) doctorNotes?: string;
}

export class UpdateMedicalEncounterDto {
  @IsOptional() @IsIn(ENCOUNTER_TYPES) encounterType?: (typeof ENCOUNTER_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(20000) complaints?: string;
  @IsOptional() @IsString() @MaxLength(40000) anamnesis?: string;
  @IsOptional() @IsString() @MaxLength(20000) chronicConditions?: string;
  @IsOptional() @IsString() @MaxLength(20000) allergies?: string;
  @IsOptional() @IsString() @MaxLength(20000) currentMedications?: string;
  @IsOptional() @IsObject() examinationData?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(40000) clinicalAssessment?: string;
  @IsOptional() @IsString() @MaxLength(40000) recommendations?: string;
  @IsOptional() @IsString() @MaxLength(20000) requiredTests?: string;
  @IsOptional() @IsBoolean() needOfflineVisit?: boolean;
  @IsOptional() @IsBoolean() followUpRequired?: boolean;
  @IsOptional() @IsDateString() followUpDate?: string;
  @IsOptional() @IsString() @MaxLength(40000) doctorNotes?: string;
}

export class TransitionMedicalEncounterDto {
  @IsIn(ENCOUNTER_STATUSES) status!: (typeof ENCOUNTER_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}
