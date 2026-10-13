-- LOCAL DEVELOPMENT ONLY. Never apply this file to staging/production.

INSERT INTO doctor_working_hours(doctor_id,weekday,local_start,local_end,timezone)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', d, '09:00'::time, '17:00'::time, 'Europe/Berlin'
FROM generate_series(1,5) d
ON CONFLICT DO NOTHING;

INSERT INTO app_users(id,identity_subject,email,full_name,locale,timezone,country_code)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01','55555555-5555-5555-5555-555555555555','doctor@medicare.local','Анна Волкова','ru','Europe/Berlin',null),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02','66666666-6666-6666-6666-666666666666','patient@medicare.local','Ирина Соколова','ru','Europe/Berlin',null),
  ('dddddddd-dddd-dddd-dddd-dddddddddd03','77777777-7777-7777-7777-777777777777','admin@medicare.local','Local Admin','ru','Europe/Berlin',null)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles(user_id,role)
SELECT id,'doctor' FROM app_users WHERE identity_subject='55555555-5555-5555-5555-555555555555'
ON CONFLICT DO NOTHING;
INSERT INTO user_roles(user_id,role)
SELECT id,'patient' FROM app_users WHERE identity_subject='66666666-6666-6666-6666-666666666666'
ON CONFLICT DO NOTHING;
INSERT INTO user_roles(user_id,role)
SELECT id,'admin' FROM app_users WHERE identity_subject='77777777-7777-7777-7777-777777777777'
ON CONFLICT DO NOTHING;

UPDATE doctor_profiles
SET account_user_id=(SELECT id FROM app_users WHERE identity_subject='55555555-5555-5555-5555-555555555555')
WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' AND account_user_id IS NULL;

INSERT INTO patient_profiles(id,owner_user_id,full_name,birth_date,sex,relation_to_owner)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001',id,'Ирина Соколова','1988-04-17','female','self'
FROM app_users WHERE identity_subject='66666666-6666-6666-6666-666666666666'
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE selected_slot uuid;
DECLARE patient_user uuid;
BEGIN
  SELECT id INTO patient_user FROM app_users WHERE identity_subject='66666666-6666-6666-6666-666666666666';
  IF patient_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments WHERE id='cccccccc-cccc-cccc-cccc-cccccccc0001') THEN
    SELECT id INTO selected_slot
    FROM appointment_slots
    WHERE doctor_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' AND status='available' AND starts_at > now()
    ORDER BY starts_at LIMIT 1;
    IF selected_slot IS NOT NULL THEN
      UPDATE appointment_slots SET status='booked',updated_at=now() WHERE id=selected_slot;
      INSERT INTO appointments(id,slot_id,doctor_id,patient_profile_id,created_by_user_id,status,reason,patient_timezone,price_minor,currency)
      SELECT 'cccccccc-cccc-cccc-cccc-cccccccc0001',s.id,s.doctor_id,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001',patient_user,
             'confirmed','Повторяющиеся головные боли в течение двух недель','Europe/Berlin',s.price_minor,s.currency
      FROM appointment_slots s WHERE s.id=selected_slot;
      INSERT INTO appointment_status_history(appointment_id,from_status,to_status,changed_by_user_id,reason)
      VALUES ('cccccccc-cccc-cccc-cccc-cccccccc0001',null,'confirmed',patient_user,'local development seed');
    END IF;
  END IF;
END $$;
