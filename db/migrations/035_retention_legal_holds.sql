BEGIN;

-- Fail-closed legal holds for automated retention classes. Holds are class-wide:
-- no material belonging to a held class can be deleted while the hold is active.
CREATE TABLE retention_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_class text NOT NULL REFERENCES retention_policies(data_class) ON DELETE RESTRICT,
  reason varchar(2000) NOT NULL CHECK (length(trim(reason)) >= 10),
  created_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_by_user_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  released_at timestamptz,
  release_reason varchar(2000),
  CONSTRAINT retention_hold_release_consistent CHECK (
    (released_at IS NULL AND released_by_user_id IS NULL AND release_reason IS NULL)
    OR
    (released_at IS NOT NULL AND released_by_user_id IS NOT NULL
      AND release_reason IS NOT NULL AND length(trim(release_reason)) >= 10)
  )
);
CREATE UNIQUE INDEX retention_legal_holds_one_active
  ON retention_legal_holds(data_class) WHERE released_at IS NULL;

-- Serialize hold registration/release with any retention DELETE/soft-delete
-- by locking the respective policy row in the same database transaction.
CREATE FUNCTION retention_legal_hold_lock_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  name text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Legal hold evidence cannot be deleted; release instead';
  END IF;
  name := NEW.data_class;
  PERFORM 1 FROM retention_policies WHERE data_class=name FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retention policy % must exist before a legal hold', name;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.released_at IS NOT NULL THEN
      RAISE EXCEPTION 'Released legal holds are immutable';
    END IF;
    IF NEW.data_class IS DISTINCT FROM OLD.data_class
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Legal hold evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retention_legal_hold_write
BEFORE INSERT OR UPDATE OR DELETE ON retention_legal_holds
FOR EACH ROW EXECUTE FUNCTION retention_legal_hold_lock_policy();

CREATE FUNCTION retention_check_legal_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  name text := TG_ARGV[0];
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.status='deleted' OR NEW.status IS DISTINCT FROM 'deleted' THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM 1 FROM retention_policies WHERE data_class=name FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM retention_legal_holds
    WHERE data_class=name AND released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Retention legal hold active for %', name USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER consultation_materials_legal_hold
BEFORE DELETE ON consultation_materials
FOR EACH ROW EXECUTE FUNCTION retention_check_legal_hold('consultation_materials');
CREATE TRIGGER medical_documents_legal_hold
BEFORE UPDATE OF status ON medical_documents
FOR EACH ROW EXECUTE FUNCTION retention_check_legal_hold('medical_documents');

COMMIT;
