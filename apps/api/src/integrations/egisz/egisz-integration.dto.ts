import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

export const EGISZ_ADAPTER_KINDS = ["organization_registry", "doctor_registry", "remd", "patient"] as const;
export type EgiszAdapterKind = (typeof EGISZ_ADAPTER_KINDS)[number];

export const INTEGRATION_TARGET_TYPES = ["medical_organization", "doctor", "medical_document_version", "patient"] as const;
export type IntegrationTargetType = (typeof INTEGRATION_TARGET_TYPES)[number];

export const INTEGRATION_JOB_STATUSES = ["queued", "processing", "succeeded", "failed", "cancelled"] as const;
export type IntegrationJobStatus = (typeof INTEGRATION_JOB_STATUSES)[number];

export class CreateEgiszIntegrationJobDto {
  @IsIn(EGISZ_ADAPTER_KINDS)
  adapterKind!: EgiszAdapterKind;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  operation!: string;

  @IsIn(INTEGRATION_TARGET_TYPES)
  targetType!: IntegrationTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;
}

export class ListEgiszIntegrationJobsQueryDto {
  @IsOptional()
  @IsIn(INTEGRATION_JOB_STATUSES)
  status?: IntegrationJobStatus;

  @IsOptional()
  @IsIn(EGISZ_ADAPTER_KINDS)
  adapterKind?: EgiszAdapterKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
