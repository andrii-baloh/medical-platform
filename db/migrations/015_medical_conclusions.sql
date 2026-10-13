BEGIN;

CREATE TABLE IF NOT EXISTS medical_conclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
  organization_id uuid,
  encounter_id uuid REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE RESTRICT,
  consultation_version_id uuid NOT NULL UNIQUE REFERENCES consultation_versions(id) ON DELETE RESTRICT,
  conclusion_date timestamptz NOT NULL,
  complaints text,
  anamnesis text,
  reviewed_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  clinical_assessment text,
  diagnosis_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations text,
  investigations text,
  offline_visit_recommendation boolean NOT NULL DEFAULT false,
  follow_up jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 char(64) NOT NULL,
  signature_method text NOT NULL,
  signed_at timestamptz NOT NULL,
  document_version integer NOT NULL CHECK (document_version > 0),
  registration_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultation_id, document_version)
);
CREATE INDEX IF NOT EXISTS idx_medical_conclusions_patient ON medical_conclusions(patient_profile_id, conclusion_date DESC);
CREATE INDEX IF NOT EXISTS idx_medical_conclusions_encounter ON medical_conclusions(encounter_id) WHERE encounter_id IS NOT NULL;

INSERT INTO medical_conclusions(
  patient_profile_id,doctor_id,organization_id,encounter_id,consultation_id,consultation_version_id,
  conclusion_date,complaints,anamnesis,clinical_assessment,recommendations,investigations,
  offline_visit_recommendation,follow_up,content_sha256,signature_method,signed_at,document_version
)
SELECT
  a.patient_profile_id,a.doctor_id,e.organization_id,e.id,c.id,cv.id,
  cv.signed_at,
  cv.snapshot->>'complaints',cv.snapshot->>'anamnesis',cv.snapshot->>'assessment',cv.snapshot->>'recommendations',
  e.required_tests,coalesce(e.need_offline_visit,false),
  jsonb_build_object('required',coalesce(e.follow_up_required,false),'date',e.follow_up_date),
  cv.content_sha256,cv.signature_method,cv.signed_at,cv.version_no
FROM consultation_versions cv
JOIN consultations c ON c.id=cv.consultation_id
JOIN appointments a ON a.id=cv.appointment_id
LEFT JOIN medical_encounters e ON e.appointment_id=a.id
ON CONFLICT (consultation_version_id) DO NOTHING;

COMMIT;
