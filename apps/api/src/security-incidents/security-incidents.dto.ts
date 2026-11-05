import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export const INCIDENT_TYPES = ["unauthorized_access","data_disclosure","malware","account_compromise","availability","integrity","other"] as const;
export const INCIDENT_SEVERITIES = ["low","medium","high","critical"] as const;
export const INCIDENT_STATUSES = ["detected","triage","contained","investigating","resolved","closed"] as const;
export const BREACH_STATES = ["undetermined","confirmed","ruled_out"] as const;
export const REGULATOR_STATES = ["not_assessed","not_required","required","initial_submitted","final_submitted"] as const;
type IncidentType = typeof INCIDENT_TYPES[number];
type Severity = typeof INCIDENT_SEVERITIES[number];
type Status = typeof INCIDENT_STATUSES[number];
type Breach = typeof BREACH_STATES[number];
type Regulator = typeof REGULATOR_STATES[number];

export class CreateIncidentDto {
  @IsIn(INCIDENT_TYPES) incidentType!: IncidentType;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsIn(INCIDENT_SEVERITIES) severity!: Severity;
  @IsOptional() @IsDateString() detectedAt?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class UpdateIncidentDto {
  @IsOptional() @IsIn(INCIDENT_STATUSES) status?: Status;
  @IsOptional() @IsIn(INCIDENT_SEVERITIES) severity?: Severity;
  @IsOptional() @IsIn(BREACH_STATES) personalDataBreach?: Breach;
  @IsOptional() @IsBoolean() rightsAffected?: boolean;
  @IsOptional() @IsIn(REGULATOR_STATES) regulatorNotification?: Regulator;
  @IsOptional() @IsString() @MaxLength(4000) containmentActions?: string;
  @IsOptional() @IsString() @MaxLength(8000) finalReport?: string;
  @IsOptional() @IsUUID() investigatorUserId?: string;
  @IsOptional() @IsInt() @Min(0) affectedUsersEstimate?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({each:true}) affectedSystems?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({each:true}) affectedDataCategories?: string[];
}

export class RecordNotificationDto {
  @IsIn(["initial","final"]) kind!: "initial" | "final";
  @IsString() @MinLength(3) @MaxLength(200) reference!: string;
  @IsOptional() @IsDateString() submittedAt?: string;
}

export class ListIncidentsDto {
  @IsOptional() @IsIn(INCIDENT_STATUSES) status?: Status;
  @IsOptional() @IsIn(INCIDENT_SEVERITIES) severity?: Severity;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
