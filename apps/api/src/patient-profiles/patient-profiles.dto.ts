import { IsDateString, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

export const PATIENT_SEX_VALUES = ["female", "male", "other", "unspecified"] as const;
export type PatientSex = (typeof PATIENT_SEX_VALUES)[number];

// relation_to_owner values accepted by the owner-managed patient profiles API.
// 'self' is reserved for the auto-created primary profile and cannot be created/assigned here.
export const DEPENDENT_RELATION_VALUES = ["child", "parent", "spouse", "sibling", "relative", "other"] as const;
export type DependentRelation = (typeof DEPENDENT_RELATION_VALUES)[number];

export class CreatePatientProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsIn(PATIENT_SEX_VALUES as unknown as string[])
  sex?: PatientSex;

  @IsString()
  @IsIn(DEPENDENT_RELATION_VALUES as unknown as string[])
  relationToOwner!: DependentRelation;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalRepresentativeName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: "phone must be E.164 format" })
  phone?: string | null;
}

export class UpdatePatientProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @IsIn(PATIENT_SEX_VALUES as unknown as string[])
  sex?: PatientSex | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalRepresentativeName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: "phone must be E.164 format" })
  phone?: string | null;
}
