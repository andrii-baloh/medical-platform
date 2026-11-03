import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export const MONITORING_METRICS = [
  "systolic",
  "diastolic",
  "pulse",
  "spo2",
  "glucose",
  "weight",
  "temperature",
  "symptom",
] as const;

export type MonitoringMetric = (typeof MONITORING_METRICS)[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export const ALERT_STATUSES = ["open", "acknowledged", "resolved", "dismissed"] as const;

export class CreateProgramDto {
  @IsString()
  @Length(3, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  condition?: string;
}

export class CreateEnrollmentDto {
  @IsUUID()
  programId!: string;

  @IsUUID()
  patientProfileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateMeasurementDto {
  /** Optional in the body: the route param is authoritative. */
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsIn(MONITORING_METRICS)
  metric!: MonitoringMetric;

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-zА-Яа-я%/]+$/)
  unit?: string;

  @IsOptional()
  @IsISO8601()
  measuredAt?: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class CreateThresholdDto {
  @IsIn(MONITORING_METRICS)
  metric!: MonitoringMetric;

  @IsOptional()
  @IsNumber()
  minValue?: number;

  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];
}

export class AlertStatusDto {
  @IsIn(["acknowledged", "resolved", "dismissed"])
  status!: "acknowledged" | "resolved" | "dismissed";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateReviewDto {
  @IsString()
  @Length(3, 4000)
  summary!: string;

  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @IsIn(["continue", "adjust_thresholds", "schedule_visit", "close"])
  action?: "continue" | "adjust_thresholds" | "schedule_visit" | "close";
}
