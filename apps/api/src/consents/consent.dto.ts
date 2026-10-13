import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
export class SignConsentDto { @IsUUID() templateVersionId!:string; @IsIn(["oidc_session","esia","qualified_signature","other"]) authenticationMethod!:string; @IsOptional() @IsString() @MaxLength(20000) signature?:string; }
export class RevokeConsentDto { @IsOptional() @IsString() @MaxLength(4000) reason?:string; }
