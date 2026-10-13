import { IsInt, Max, Min } from "class-validator";

export class UpdateDoctorReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
