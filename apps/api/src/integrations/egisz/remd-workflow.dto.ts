import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export const REMD_REGISTRATION_STATUSES = ["queued", "submitted", "registered", "failed"] as const;
export type RemdRegistrationStatus = (typeof REMD_REGISTRATION_STATUSES)[number];

export class ListRemdRegistrationsQueryDto {
  @IsOptional()
  @IsIn(REMD_REGISTRATION_STATUSES)
  status?: RemdRegistrationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListRemdCandidatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
