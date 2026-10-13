import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class DoctorCancelAppointmentDto {
  @IsOptional() @IsString() reason?: string;
}

export class ConsultationDraftDto {
  @IsOptional() @IsString() complaints?: string;
  @IsOptional() @IsString() anamnesis?: string;
  @IsOptional() @IsString() assessment?: string;
  @IsOptional() @IsString() recommendations?: string;
}

export class WorkingHourDto {
  @IsInt() @Min(1) @Max(7) weekday!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end!: string;
  @IsString() timezone!: string;
}

export class SetWorkingHoursDto {
  @IsArray() @ArrayMaxSize(21) @ValidateNested({ each: true }) @Type(() => WorkingHourDto)
  hours!: WorkingHourDto[];
}

export class SlotInputDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

export class CreateDoctorSlotsDto {
  @IsOptional()
  @IsUUID()
  serviceOfferId?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(64) @ValidateNested({ each: true }) @Type(() => SlotInputDto)
  slots!: SlotInputDto[];
}
