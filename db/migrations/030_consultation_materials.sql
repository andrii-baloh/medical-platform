BEGIN;

-- Stage 16: consultation chat and materials.
--
-- Every object is bound to a medical encounter, so nothing can exist as an
-- orphan chat room or file drop. Real files reuse `medical_documents`
-- (MinIO + ClamAV pipeline); this table only classifies the material and
-- links it to the consultation. Retention is Stage 17 and is not applied here.
CREATE TABLE IF NOT EXISTS consultation_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES medical_encounters(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  author_role text NOT NULL CHECK (author_role IN ('patient','doctor','system')),
  material_type text NOT NULL CHECK (material_type IN ('chat','file','image','voice','video','recording','measurement')),
  document_id uuid UNIQUE REFERENCES medical_documents(id) ON DELETE RESTRICT,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (material_type = 'chat' AND document_id IS NULL AND body IS NOT NULL AND length(body) BETWEEN 1 AND 4000)
    OR (material_type IN ('file','image','voice','video','recording') AND document_id IS NOT NULL AND body IS NULL)
    OR (material_type = 'measurement' AND metadata <> '{}'::jsonb)
  )
);

CREATE INDEX IF NOT EXISTS idx_consultation_materials_encounter
  ON consultation_materials(encounter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultation_materials_appointment
  ON consultation_materials(appointment_id, created_at DESC);

COMMIT;
