-- M-11: the scheduled jobs and the weekly backup. E20 (nightly close and its
-- idempotency), BR-160 (who gets a reminder and who does not), BR-163 (three attempts a
-- day and what closes the day), BR-118's retry queue, and the owner-only reach of the two
-- new tables (doc 07 §6).
select plan(43);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-00000000a001', null),
  ('bbbbbbbb-0000-0000-0000-00000000a002', null),
  ('bbbbbbbb-0000-0000-0000-00000000a003', null),
  ('bbbbbbbb-0000-0000-0000-00000000a004', null);
insert into gyms (id, name, timezone) values
  ('bbbbbbbb-0000-0000-0000-00000000b001', 'pgTAP Poslovi', 'Europe/Podgorica'),
  ('bbbbbbbb-0000-0000-0000-00000000b002', 'pgTAP Druga', 'Europe/Podgorica');
insert into gym_settings (gym_id, auto_close_time, expiry_reminder_days) values
  ('bbbbbbbb-0000-0000-0000-00000000b001', '23:00', 3),
  ('bbbbbbbb-0000-0000-0000-00000000b002', '23:00', 3);
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.jb.ana'),
  ('bbbbbbbb-0000-0000-0000-00000000c002', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.jb.vlasnik'),
  ('bbbbbbbb-0000-0000-0000-00000000c003', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.jb.menadzer'),
  ('bbbbbbbb-0000-0000-0000-00000000c004', 'bbbbbbbb-0000-0000-0000-00000000b002',
   'bbbbbbbb-0000-0000-0000-00000000a004', 'owner', 'pgTAP Tudji', 'pgtap.jb.tudji');

-- E20: one open shift that began at 08:00 today, so it is always before the 23:00 close.
insert into shifts (id, gym_id, staff_id, started_at) values
  ('bbbbbbbb-0000-0000-0000-00000000d001', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-00000000c001',
   (gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + time '08:00')
     at time zone 'Europe/Podgorica');

insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price, covers_gym) values
  ('bbbbbbbb-0000-0000-0000-00000000f001', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'pgTAP Mjesečna', 'gym', 1, 'month', 30, true);
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price, covers_group) values
  ('bbbbbbbb-0000-0000-0000-00000000f002', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'pgTAP Grupni', 'group', 1, 'month', 40, true);

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, is_anonymized, anonymized_at, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000020001', 'bbbbbbbb-0000-0000-0000-00000000b001', 1,
   'Đurđa', 'Čučković', '+38267000201', 'podsjetnik@pgtap.invalid', '1990-01-01', false, null,
   'bbbbbbbb-0000-0000-0000-00000000c002'),
  ('bbbbbbbb-0000-0000-0000-000000020002', 'bbbbbbbb-0000-0000-0000-00000000b001', 2,
   'Obrisan', 'Član', null, null, null, true, now(),
   'bbbbbbbb-0000-0000-0000-00000000c002'),
  ('bbbbbbbb-0000-0000-0000-000000020003', 'bbbbbbbb-0000-0000-0000-00000000b001', 3,
   'Produžio', 'Član', '+38267000203', 'produzio@pgtap.invalid', '1990-01-01', false, null,
   'bbbbbbbb-0000-0000-0000-00000000c002'),
  ('bbbbbbbb-0000-0000-0000-000000020004', 'bbbbbbbb-0000-0000-0000-00000000b001', 4,
   'Poništen', 'Član', '+38267000204', 'ponisten@pgtap.invalid', '1990-01-01', false, null,
   'bbbbbbbb-0000-0000-0000-00000000c002'),
  ('bbbbbbbb-0000-0000-0000-000000020005', 'bbbbbbbb-0000-0000-0000-00000000b001', 5,
   'Kasnije', 'Član', '+38267000205', 'kasnije@pgtap.invalid', '1990-01-01', false, null,
   'bbbbbbbb-0000-0000-0000-00000000c002');

-- E20: two visits still open, both started at 08:00 today.
insert into visits (id, gym_id, member_id, visit_type, checked_in_at, checked_in_by, shift_id) values
  ('bbbbbbbb-0000-0000-0000-000000030001', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020001', 'gym',
   (gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + time '08:00') at time zone 'Europe/Podgorica',
   'bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-00000000d001'),
  ('bbbbbbbb-0000-0000-0000-000000030002', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020003', 'gym',
   (gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + time '08:00') at time zone 'Europe/Podgorica',
   'bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-00000000d001');

-- BR-160 fixtures: the reminder day is gym today + 3.
insert into memberships (id, gym_id, member_id, plan_id, start_date, end_date, start_reason,
                         covers_gym, covers_group, covers_personal, created_by, shift_id,
                         voided_at, voided_by, void_reason) values
  -- Đurđa: ends in exactly three days, nothing else — the one reminder of the day.
  ('bbbbbbbb-0000-0000-0000-000000040001', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020001', 'bbbbbbbb-0000-0000-0000-00000000f001',
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') - 27,
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 3, 'pgTAP',
   true, false, false, 'bbbbbbbb-0000-0000-0000-00000000c002',
   'bbbbbbbb-0000-0000-0000-00000000d001', null, null, null),
  -- BR-046: the anonymized member is never written to.
  ('bbbbbbbb-0000-0000-0000-000000040002', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020002', 'bbbbbbbb-0000-0000-0000-00000000f001',
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') - 27,
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 3, 'pgTAP',
   true, false, false, 'bbbbbbbb-0000-0000-0000-00000000c002',
   'bbbbbbbb-0000-0000-0000-00000000d001', null, null, null),
  -- Already renewed: a later membership covering the same visit type.
  ('bbbbbbbb-0000-0000-0000-000000040003', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020003', 'bbbbbbbb-0000-0000-0000-00000000f001',
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') - 27,
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 3, 'pgTAP',
   true, false, false, 'bbbbbbbb-0000-0000-0000-00000000c002',
   'bbbbbbbb-0000-0000-0000-00000000d001', null, null, null),
  ('bbbbbbbb-0000-0000-0000-000000040004', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020003', 'bbbbbbbb-0000-0000-0000-00000000f001',
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 4,
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 34, 'pgTAP',
   true, false, false, 'bbbbbbbb-0000-0000-0000-00000000c002',
   'bbbbbbbb-0000-0000-0000-00000000d001', null, null, null),
  -- Voided: not a membership any more.
  ('bbbbbbbb-0000-0000-0000-000000040005', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020004', 'bbbbbbbb-0000-0000-0000-00000000f001',
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') - 27,
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 3, 'pgTAP',
   true, false, false, 'bbbbbbbb-0000-0000-0000-00000000c002',
   'bbbbbbbb-0000-0000-0000-00000000d001', now(), 'bbbbbbbb-0000-0000-0000-00000000c002', 'pgTAP'),
  -- Ends in five days: BR-160 is a single day, not a window.
  ('bbbbbbbb-0000-0000-0000-000000040006', 'bbbbbbbb-0000-0000-0000-00000000b001',
   'bbbbbbbb-0000-0000-0000-000000020005', 'bbbbbbbb-0000-0000-0000-00000000f001',
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') - 25,
   gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + 5, 'pgTAP',
   true, false, false, 'bbbbbbbb-0000-0000-0000-00000000c002',
   'bbbbbbbb-0000-0000-0000-00000000d001', null, null, null);

-- Doc 08 §8: the jobs belong to the service role ------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-00000000a002"}';
set local role authenticated;
select throws_ok(
  $$select job_nightly('bbbbbbbb-0000-0000-0000-00000000b001')$$,
  '42501', null, 'Doc 08 §8: a staff session cannot run the nightly job');
select throws_ok(
  $$select backup_table_rows('bbbbbbbb-0000-0000-0000-00000000b001', 'members')$$,
  '42501', null, 'BR-163: a staff session cannot export a table');

reset role;
set local role service_role;

-- jobs_due (doc 08 §8) ----------------------------------------------------------------
update gym_settings set auto_close_time = '00:00'
where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001';
select ok(
  'bbbbbbbb-0000-0000-0000-00000000b001' in (select jobs_due('nightly')),
  'Doc 08 §8: a gym past its close time is due for the nightly job');

insert into job_runs (gym_id, job, run_date)
values ('bbbbbbbb-0000-0000-0000-00000000b001', 'nightly',
        gym_today('bbbbbbbb-0000-0000-0000-00000000b001'));
select ok(
  'bbbbbbbb-0000-0000-0000-00000000b001' not in (select jobs_due('nightly')),
  'BR-162: a job that already ran today is not due again');
delete from job_runs where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001';
update gym_settings set auto_close_time = '23:00'
where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001';

insert into backup_runs (gym_id, run_date, attempt, status)
select 'bbbbbbbb-0000-0000-0000-00000000b001',
       gym_today('bbbbbbbb-0000-0000-0000-00000000b001'), n, 'failed'
from generate_series(1, 3) as n;
select ok(
  'bbbbbbbb-0000-0000-0000-00000000b001' not in (select jobs_due('backup')),
  'BR-163: after three attempts the backup is not tried again that day');
delete from backup_runs where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001';

-- E20: the nightly job ------------------------------------------------------------------
select is(
  (job_nightly('bbbbbbbb-0000-0000-0000-00000000b001') ->> 'visits_closed')::int,
  2, 'E20: both open visits are checked out');

select is(
  (select count(*)::int from visits
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001' and checked_out_at is null),
  0, 'BR-082: no visit is left open');
select is(
  (select count(*)::int from visits
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001' and auto_checkout),
  2, 'BR-082: both are marked as automatic check-outs');
select is(
  (select distinct checked_out_at from visits
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001'),
  (gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + time '23:00')
    at time zone 'Europe/Podgorica',
  'BR-082: they end at the automatic close time, not at the handler''s run time');
select is(
  (select checked_out_by from visits
   where id = 'bbbbbbbb-0000-0000-0000-000000030001'),
  null, 'BR-082: nobody checked them out');

select is(
  (select close_type from shifts where id = 'bbbbbbbb-0000-0000-0000-00000000d001'),
  'auto'::shift_close_type, 'BR-116: the shift is closed as automatic');
select is(
  (select closed_at from shifts where id = 'bbbbbbbb-0000-0000-0000-00000000d001'),
  (gym_today('bbbbbbbb-0000-0000-0000-00000000b001') + time '23:00')
    at time zone 'Europe/Podgorica',
  'BR-116: it closes at the automatic close time');
select is(
  (select counted_cash from shifts where id = 'bbbbbbbb-0000-0000-0000-00000000d001'),
  null, 'BR-116: no cash was counted');
select is(
  (select closed_by from shifts where id = 'bbbbbbbb-0000-0000-0000-00000000d001'),
  null, 'BR-116: nobody closed it');

-- E20: running it again changes nothing.
select is(
  (job_nightly('bbbbbbbb-0000-0000-0000-00000000b001') ->> 'ran')::boolean,
  false, 'E20: the second run of the day does nothing');
select is(
  (select count(*)::int from job_runs
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001' and job = 'nightly'),
  1, 'BR-162: exactly one nightly run is recorded for the day');
select is(
  (select count(*)::int from shifts
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001' and closed_at is null),
  0, 'E20: no shift was reopened');

-- BR-160: the expiry reminders ----------------------------------------------------------
select is(
  json_array_length(job_expiring_memberships('bbbbbbbb-0000-0000-0000-00000000b001') -> 'reminders'),
  1, 'BR-160: exactly one membership qualifies today');
select is(
  (select count(*)::int from expiry_notifications
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001'),
  1, 'BR-160: one notification row is written');
select is(
  (select membership_id from expiry_notifications
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001'),
  'bbbbbbbb-0000-0000-0000-000000040001'::uuid,
  'BR-160: the anonymized, renewed, voided and later memberships are all skipped');
select is(
  (select status from expiry_notifications
   where membership_id = 'bbbbbbbb-0000-0000-0000-000000040001'),
  'pending'::email_status, 'BR-160: the row waits for the send to be recorded');

select is(
  (job_expiring_memberships('bbbbbbbb-0000-0000-0000-00000000b001') ->> 'ran')::boolean,
  false, 'BR-162: the morning job is idempotent for the day');
select is(
  (select count(*)::int from expiry_notifications
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b001'),
  1, 'BR-160: no second reminder row appears');

select is(
  (record_expiry_notification('bbbbbbbb-0000-0000-0000-000000040001', 'sent', null)).status,
  'sent'::email_status, 'BR-160: the outcome is recorded on the row');
select isnt(
  (select sent_at from expiry_notifications
   where membership_id = 'bbbbbbbb-0000-0000-0000-000000040001'),
  null, 'BR-160: a sent reminder is stamped');

-- BR-163: the attempts of the day -------------------------------------------------------
select is((start_backup_run('bbbbbbbb-0000-0000-0000-00000000b002')).attempt,
          1::smallint, 'BR-163: the first attempt of the day');
select is((start_backup_run('bbbbbbbb-0000-0000-0000-00000000b002')).attempt,
          2::smallint, 'BR-163: a failed attempt is followed by a second');
select is((start_backup_run('bbbbbbbb-0000-0000-0000-00000000b002')).attempt,
          3::smallint, 'BR-163: and by a third');
select throws_ok(
  $$select start_backup_run('bbbbbbbb-0000-0000-0000-00000000b002')$$,
  'E_VALIDATION', 'BR-163: never a fourth attempt on the same day');

select is(
  (select count(*)::int from job_runs
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b002' and job = 'backup'),
  0, 'BR-163: failed attempts do not close the day');
select is(
  (finish_backup_run(
     (select id from backup_runs
      where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b002' and attempt = 3),
     'success', 'b002/kpfitness-backup.zip', 1024, true, null)).status,
  'success', 'BR-163: a successful attempt is recorded with its file');
select is(
  (select count(*)::int from job_runs
   where gym_id = 'bbbbbbbb-0000-0000-0000-00000000b002' and job = 'backup'),
  1, 'BR-163: a success closes the day');

-- BR-118: the retry queue ---------------------------------------------------------------
update shifts
set email_status = 'failed', email_attempts = 1, emailed_at = now() - interval '20 minutes'
where id = 'bbbbbbbb-0000-0000-0000-00000000d001';
select ok(
  'bbbbbbbb-0000-0000-0000-00000000d001' in (select shifts_pending_email()),
  'BR-118: a failed report older than fifteen minutes is retried');

update shifts set emailed_at = now() - interval '5 minutes'
where id = 'bbbbbbbb-0000-0000-0000-00000000d001';
select ok(
  'bbbbbbbb-0000-0000-0000-00000000d001' not in (select shifts_pending_email()),
  'BR-118: not more often than every fifteen minutes');

update shifts set email_attempts = 5, emailed_at = now() - interval '2 hours'
where id = 'bbbbbbbb-0000-0000-0000-00000000d001';
select ok(
  'bbbbbbbb-0000-0000-0000-00000000d001' not in (select shifts_pending_email()),
  'BR-118: five attempts are the end of it');

select is(
  (record_shift_report('bbbbbbbb-0000-0000-0000-00000000d001', null, 'failed')).email_attempts,
  6::smallint, 'BR-118: every attempt is counted');
select isnt(
  (select emailed_at from shifts where id = 'bbbbbbbb-0000-0000-0000-00000000d001'),
  null, 'BR-118: a failed attempt stamps the time it was made');

-- Doc 07 §6: who may read the new tables ------------------------------------------------
-- The three backup attempts belong to the second gym, the one reminder to the first.
reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-00000000a004"}';
set local role authenticated;
select is(
  (select count(*)::int from backup_runs), 3,
  'Doc 07 §6: the owner reads the backup history of their gym');

reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (select count(*)::int from expiry_notifications), 1,
  'Doc 07 §6: the owner reads the reminders of their gym');
select is(
  (select count(*)::int from backup_runs), 0,
  'Doc 07 §6: and nothing of another gym''s backups');

reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  (select count(*)::int from backup_runs), 0,
  'Doc 07 §6: a manager reads none of it');
select is(
  (select count(*)::int from expiry_notifications), 0,
  'Doc 07 §6: a manager reads no notifications either');

reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-00000000a001"}';
set local role authenticated;
select is(
  (select count(*)::int from expiry_notifications), 0,
  'Doc 07 §6: a receptionist reads none of it');

reset role;
select * from finish();
