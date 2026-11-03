import { IsIn } from "class-validator";

export class TelemedicineEventDto {
  @IsIn(["reconnecting", "connection_lost", "technical_failure"])
  event!: "reconnecting" | "connection_lost" | "technical_failure";
}
