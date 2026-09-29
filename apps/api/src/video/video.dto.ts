import { IsIn } from "class-validator";

export class VideoJoinEventDto {
  @IsIn(["joined", "left"])
  eventType!: "joined" | "left";
}
