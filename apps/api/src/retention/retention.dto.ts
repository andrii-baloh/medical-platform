import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const RETENTION_DATA_CLASSES = [
  "consultation_materials",
  "medical_documents",
  "audit_logs",
  "security_logs",
  "payment_records",
  "consent_records",
] as const;

export type RetentionDataClass = (typeof RETENTION_DATA_CLASSES)[number];

export class CreateRetentionHoldDto {
  @IsIn(RETENTION_DATA_CLASSES)
  dataClass!: RetentionDataClass;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class ReleaseRetentionHoldDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class UpsertRetentionPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36500)
  retentionDays?: number;

  @IsOptional()
  @IsIn(["delete", "soft_delete"])
  action?: "delete" | "soft_delete";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalBasis?: string;

  @IsBoolean()
  active!: boolean;
}
