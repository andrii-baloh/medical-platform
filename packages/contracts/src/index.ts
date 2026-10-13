export type UserRole = "patient" | "doctor" | "admin";
export type AppointmentStatus =
  | "confirmed"
  | "patient_checked_in"
  | "in_progress"
  | "completed"
  | "cancelled_by_patient"
  | "cancelled_by_doctor"
  | "no_show";

export type Money = { amountMinor: number; currency: string };

export interface DoctorSummary {
  id: string;
  slug: string;
  fullName: string;
  specialty: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  price: Money;
  languages: string[];
  patientGroups: string[];
  about?: string | null;
  initials?: string | null;
}

export interface AppointmentSlotDto {
  id: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  price: Money;
}

export interface PatientProfileDto {
  id: string;
  fullName: string;
  birthDate?: string | null;
  relationToOwner: string;
}

export interface AppointmentDto {
  id: string;
  status: AppointmentStatus;
  doctor: Pick<DoctorSummary, "id" | "slug" | "fullName" | "specialty">;
  patient: PatientProfileDto;
  startsAt: string;
  endsAt: string;
  patientTimezone: string;
  price: Money;
  reason?: string | null;
}

export interface MedicalDocumentDto {
  id: string;
  patientProfileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  status: "uploading" | "active" | "deleted";
  createdAt: string;
}


export interface DoctorWorkspaceAppointmentDto {
  id: string;
  status: AppointmentStatus;
  reason?: string | null;
  startsAt: string;
  endsAt: string;
  patient: { id: string; fullName: string; birthDate?: string | null };
}

export interface ConsultationDraftDto {
  id: string;
  appointmentId: string;
  version: number;
  complaints?: string | null;
  anamnesis?: string | null;
  assessment?: string | null;
  recommendations?: string | null;
  signedAt?: string | null;
}

export interface ConsultationVersionDto {
  version: number;
  snapshot: Record<string, unknown>;
  contentSha256: string;
  previousVersionSha256?: string | null;
  signedAt: string;
  signatureMethod: string;
}
