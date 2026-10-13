BEGIN;

-- Patient contact phone. Nullable: the primary (self) profile is created by
-- ensureAccount without a phone, and the user fills it in via the profile
-- completion flow.
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS phone text;

COMMIT;
