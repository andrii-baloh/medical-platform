import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class RefundRequestDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reasonCode?: string;
}
