import { IsBoolean, IsOptional } from "class-validator";

export class UpdateDoctorAdminDto {
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
