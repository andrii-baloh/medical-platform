import { IsIn, IsInt, IsMimeType, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

const categories = ["analysis","discharge","conclusion","prescription","image","other"] as const;

export class CreateUploadIntentDto {
  @IsUUID()
  patientProfileId!: string;

  @IsString()
  @MaxLength(255)
  originalName!: string;

  @IsMimeType()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes!: number;

  @IsIn(categories)
  category: typeof categories[number] = "other";
}

export class CompleteUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sha256Hex?: string;
}

export class GrantDocumentDto {
  @IsUUID()
  doctorId!: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
