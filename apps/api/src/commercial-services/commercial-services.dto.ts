import {
  Equals,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateServiceCatalogDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export class CreateContractTemplateDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  displayName!: string;
}

export class PublishContractVersionDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  versionNo!: number;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  locale = "ru";

  @IsString()
  @MinLength(1)
  @MaxLength(200000)
  contentText!: string;
}

export class CreateServiceOfferDto {
  @IsUUID()
  serviceCatalogId!: string;

  @IsUUID()
  doctorId!: string;

  @IsUUID()
  contractTemplateId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsInt()
  @Min(0)
  @Max(1000000000)
  priceMinor!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  conditionsText!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  refundPolicyText!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  serviceProcedureText!: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class AcceptPatientContractDto {
  @IsUUID()
  contractVersionId!: string;

  @IsBoolean()
  @Equals(true)
  accepted!: true;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authenticationMethod = "authenticated_click";
}
