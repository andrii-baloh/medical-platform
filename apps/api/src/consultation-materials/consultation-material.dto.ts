import { IsIn, IsString, IsUUID, Length } from "class-validator";

export class ChatMessageDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}

export const ATTACHABLE_MATERIAL_TYPES = ["file", "image", "voice", "video"] as const;

export class AttachDocumentDto {
  @IsUUID()
  documentId!: string;

  @IsIn(ATTACHABLE_MATERIAL_TYPES)
  materialType!: (typeof ATTACHABLE_MATERIAL_TYPES)[number];
}
