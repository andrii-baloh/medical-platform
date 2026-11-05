-- Isolated synthetic PostgreSQL test. Everything is rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  actor uuid;
  patient uuid;
  doctor uuid;
  appointment uuid;
  encounter uuid;
  material uuid;
  document uuid;
  material_hold uuid;
  document_hold uuid;
  material_blocked boolean := false;
  document_blocked boolean := false;
  evidence_blocked boolean := false;
BEGIN
  SELECT a.id,a.patient_profile_id,a.doctor_id,p.owner_user_id
  INTO appointment,patient,doctor,actor
  FROM appointments a JOIN patient_profiles p ON p.id=a.patient_profile_id
  ORDER BY a.created_at DESC LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'No synthetic appointment fixtures'; END IF;

  INSERT INTO retention_policies(data_class,active)
  VALUES ('consultation_materials',false),('medical_documents',false)
  ON CONFLICT(data_class) DO NOTHING;
  INSERT INTO medical_encounters(patient_profile_id,doctor_id,encounter_type)
  VALUES(patient,doctor,'primary_remote') RETURNING id INTO encounter;
  INSERT INTO consultation_materials(encounter_id,appointment_id,author_user_id,author_role,material_type,body)
  VALUES(encounter,appointment,actor,'patient','chat','Synthetic test material only')
  RETURNING id INTO material;
  INSERT INTO medical_documents(patient_profile_id,uploaded_by_user_id,storage_key,original_name,mime_type,size_bytes)
  VALUES(patient,actor,'test-legal-hold-'||gen_random_uuid()::text,'synthetic.txt','text/plain',20)
  RETURNING id INTO document;

  INSERT INTO retention_legal_holds(data_class,reason,created_by_user_id)
  VALUES('consultation_materials','Synthetic test of a class-wide litigation hold',actor)
  RETURNING id INTO material_hold;
  INSERT INTO retention_legal_holds(data_class,reason,created_by_user_id)
  VALUES('medical_documents','Synthetic test of a class-wide regulatory hold',actor)
  RETURNING id INTO document_hold;

  BEGIN
    DELETE FROM consultation_materials WHERE id=material;
  EXCEPTION WHEN SQLSTATE '55000' THEN material_blocked:=true;
  END;
  BEGIN
    UPDATE medical_documents SET status='deleted' WHERE id=document;
  EXCEPTION WHEN SQLSTATE '55000' THEN document_blocked:=true;
  END;
  IF NOT material_blocked OR NOT document_blocked THEN
    RAISE EXCEPTION 'Legal hold failed: material %, document %',material_blocked,document_blocked;
  END IF;
  BEGIN
    DELETE FROM retention_legal_holds WHERE id=material_hold;
  EXCEPTION WHEN raise_exception THEN evidence_blocked:=true;
  END;
  IF NOT evidence_blocked THEN RAISE EXCEPTION 'Legal hold evidence was deletable'; END IF;

  UPDATE retention_legal_holds
  SET released_by_user_id=actor,released_at=now(),
      release_reason='Approved after synthetic test review only'
  WHERE id IN (material_hold,document_hold);
  DELETE FROM consultation_materials WHERE id=material;
  IF FOUND THEN NULL; ELSE RAISE EXCEPTION 'Material deletion did not resume after release'; END IF;
  UPDATE medical_documents SET status='deleted' WHERE id=document;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document soft-delete did not resume after release'; END IF;

  RAISE NOTICE 'STAGE17_LEGAL_HOLD_PASS: both classes blocked while active; released holds allow operations';
END $$;
ROLLBACK;
