import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class BookAppointmentDto {
  @IsUUID()
  slotId!: string;

  @IsUUID()
  patientProfileId!: string;

  @IsString()
  @MaxLength(4000)
  reason = "";

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;
}

export class CancelAppointmentDto {
  @IsString()
  @MaxLength(1000)
  reason = "";
}
