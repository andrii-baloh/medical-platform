export type EgiszAdapterResult = {
  externalId?: string;
  status: "accepted" | "registered" | "not_found" | "rejected";
  metadata?: Record<string, string | number | boolean | null>;
};

export type OrganizationRegistryInput = {
  organizationId: string;
};

export interface OrganizationRegistryAdapter {
  syncOrganization(input: OrganizationRegistryInput): Promise<EgiszAdapterResult>;
}

export type DoctorRegistryInput = {
  doctorId: string;
};

export interface DoctorRegistryAdapter {
  syncDoctor(input: DoctorRegistryInput): Promise<EgiszAdapterResult>;
}

export type RemdSubmissionInput = {
  medicalDocumentVersionId: string;
};

export interface REMDAdapter {
  submitDocument(input: RemdSubmissionInput): Promise<EgiszAdapterResult>;
}

export type PatientIntegrationInput = {
  patientProfileId: string;
};

export interface PatientIntegrationAdapter {
  syncPatient(input: PatientIntegrationInput): Promise<EgiszAdapterResult>;
}
