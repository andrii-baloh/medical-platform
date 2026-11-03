import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from "class-validator";

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INCIDENT_STATUSES = ["open", "investigating", "contained", "reported", "closed"] as const;

export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export class CreateIncidentDto {
  @IsString()
  @Length(3, 80)
  incidentType!: string;

  @IsIn(INCIDENT_SEVERITIES)
  severity!: IncidentSeverity;

  @IsString()
  @Length(3, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedSystems?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedDataClasses?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedUsersCount?: number;

  @IsOptional()
  @IsISO8601()
  detectedAt?: string;

  @IsOptional()
  @IsISO8601()
  reportingDeadline?: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @Length(3, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @IsIn(INCIDENT_SEVERITIES)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedSystems?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedDataClasses?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedUsersCount?: number;

  @IsOptional()
  @IsUUID()
  investigatorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  containmentActions?: string;

  @IsOptional()
  @IsISO8601()
  reportingDeadline?: string;

  @IsOptional()
  @IsISO8601()
  regulatorNotifiedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regulatorReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  finalReport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class IncidentStatusDto {
  @IsIn(INCIDENT_STATUSES)
  status!: IncidentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class IncidentNoteDto {
  @IsString()
  @Length(1, 2000)
  note!: string;
}
