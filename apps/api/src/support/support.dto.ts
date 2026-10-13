import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateSupportTicketDto {
  @IsIn(["account", "appointment", "payment", "technical", "other"])
  category!: "account" | "appointment" | "payment" | "technical" | "other";

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;
}

export class AddSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsIn(["open", "pending_user", "pending_support", "resolved", "closed"])
  status?: "open" | "pending_user" | "pending_support" | "resolved" | "closed";

  @IsOptional()
  @IsIn(["normal", "high"])
  priority?: "normal" | "high";
}
