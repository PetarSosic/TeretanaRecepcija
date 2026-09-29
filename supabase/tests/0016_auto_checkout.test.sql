-- D-74: automatic check-out 1 h 30 min after check-in (BR-082a), and a scan or [Odjavi]
-- within 60 minutes of an automatic check-out records the member leaving (BR-072a).
select plan(26);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('74747474-0000-0000-0000-00000000a001', null),
  ('74747474-0000-0000-0000-00000000a002', null);
insert into gyms (id, name, timezone)
values ('74747474-0000-0000-0000-00000000b001', 'pgTAP Automatska odjava', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('74747474-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('74747474-0000-0000-0000-00000000c001', '74747474-0000-0000-0000-00000000b001',
   '74747474-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.ao.recepcija'),
  ('74747474-0000-0000-0000-00000000c002', '74747474-0000-0000-0000-00000000b001',
   '74747474-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.ao.vlasnik');
insert into shifts (id, gym_id, staff_id)
values ('74747474-0000-0000-0000-00000000c101', '74747474-0000-0000-0000-00000000b001',
        '74747474-0000-0000-0000-00000000c001');

-- Members 1–8 hold no membership, so a check-in is one scan (an unpaid gym visit).
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by)
select ('74747474-0000-0000-0000-0000000200' || lpad(n::text, 2, '0'))::uuid,
       '74747474-0000-0000-0000-00000000b001', n, 'Član', 'Broj ' || n,
       '+3826774000' || n, 'ao' || n || '@pgtap.invalid', '1990-01-01',
       '74747474-0000-0000-0000-00000000c002'
from generate_series(1, 8) as n;

insert into card_batches (id, gym_id, quantity, created_by)
values ('74747474-0000-0000-0000-000000050001', '74747474-0000-0000-0000-00000000b001', 5,
        '74747474-0000-0000-0000-00000000c002');
insert into cards (gym_id, code, batch_id, status, member_id)
select '74747474-0000-0000-0000-00000000b001', '741600000' || n,
       '74747474-0000-0000-0000-000000050001', 'active',
       ('74747474-0000-0000-0000-0000000200' || lpad(n::text, 2, '0'))::uuid
from generate_series(1, 5) as n;

-- Visits (all unpaid gym visits by the receptionist):
--   1 in for 2 h           → the job ends it 30 min ago, so a scan is a leaving;
--   2 in for 1 h 20 min    → stays open;
--   3 in for 2 h 40 min    → the job ends it 70 min ago, so a scan is a new visit;
--   4 checked out by hand 10 min ago after 1 h → a scan is a new visit;
--   5 closed by the nightly job (BR-082) 20 min ago → a scan is a leaving;
--   6 in for 1 h 35 min    → the job ends it 5 min ago, [Odjavi] is a leaving;
--   7 auto 20 min ago, but in and out again since → [Odjavi] on the old one is refused;
--   8 in for exactly 1 h 30 min → the job ends it now.
insert into visits (id, gym_id, member_id, visit_type, is_unpaid, checked_in_at,
                    checked_out_at, auto_checkout, checked_in_by, checked_out_by)
select v.id::uuid, '74747474-0000-0000-0000-00000000b001', v.member::uuid, 'gym', true,
       now() - v.inside, now() - v.outside, v.auto,
       '74747474-0000-0000-0000-00000000c001',
       case when v.outside is not null and not v.auto
            then '74747474-0000-0000-0000-00000000c001'::uuid end
from (values
  ('74747474-0000-0000-0000-000000040001', '74747474-0000-0000-0000-000000020001',
   interval '2 hours', null::interval, false),
  ('74747474-0000-0000-0000-000000040002', '74747474-0000-0000-0000-000000020002',
   interval '80 minutes', null, false),
  ('74747474-0000-0000-0000-000000040003', '74747474-0000-0000-0000-000000020003',
   interval '160 minutes', null, false),
  ('74747474-0000-0000-0000-000000040004', '74747474-0000-0000-0000-000000020004',
   interval '70 minutes', interval '10 minutes', false),
  ('74747474-0000-0000-0000-000000040005', '74747474-0000-0000-0000-000000020005',
   interval '60 minutes', interval '20 minutes', true),
  ('74747474-0000-0000-0000-000000040006', '74747474-0000-0000-0000-000000020006',
   interval '95 minutes', null, false),
  ('74747474-0000-0000-0000-000000040071', '74747474-0000-0000-0000-000000020007',
   interval '110 minutes', interval '20 minutes', true),
  ('74747474-0000-0000-0000-000000040072', '74747474-0000-0000-0000-000000020007',
   interval '10 minutes', interval '5 minutes', false),
  ('74747474-0000-0000-0000-000000040008', '74747474-0000-0000-0000-000000020008',
   interval '90 minutes', null, false)
) as v(id, member, inside, outside, auto);

-- BR-082a: the job --------------------------------------------------------------------
select is((select schedule from cron.job where jobname = 'kp-fitness-auto-checkout'),
  '* * * * *', 'BR-082a: pg_cron runs the automatic check-out every minute');

select cmp_ok(job_auto_checkout(), '>=', 4,
  'BR-082a: the job closes every visit open for 1 h 30 min or more');
select is(
  (select checked_out_at from visits where id = '74747474-0000-0000-0000-000000040001'),
  now() - interval '30 minutes',
  'BR-082a: the check-out is exactly the check-in plus 1 h 30 min, not the job''s run time');
select is(
  (select auto_checkout::text || '|' || coalesce(checked_out_by::text, 'nobody')
   from visits where id = '74747474-0000-0000-0000-000000040001'),
  'true|nobody',
  'BR-082a: marked as an automatic check-out, by nobody');
select is(
  (select checked_out_at from visits where id = '74747474-0000-0000-0000-000000040008'),
  now(), 'BR-082a: a visit of exactly 1 h 30 min is closed');
select ok(
  (select checked_out_at is null from visits where id = '74747474-0000-0000-0000-000000040002'),
  'BR-082a: a visit of 1 h 20 min stays open');
select is(
  (select checked_out_at from visits where id = '74747474-0000-0000-0000-000000040004'),
  now() - interval '10 minutes', 'BR-082a: a visit already checked out is untouched');
select is(job_auto_checkout(), 0, 'BR-162: running the job again changes nothing');

-- Nobody but the service role and pg_cron runs it --------------------------------------
select ok(not has_function_privilege('authenticated', 'job_auto_checkout()', 'execute')
          and not has_function_privilege('anon', 'job_auto_checkout()', 'execute'),
  'BR-082a: no signed-in role, not even the owner, can run the job');
select ok(has_function_privilege('service_role', 'job_auto_checkout()', 'execute'),
  'BR-082a: the service role can, for the tests');
select ok(not has_function_privilege('authenticated',
            'perform_leave_after_auto(staff, uuid)', 'execute'),
  'BR-072a: the internal leaving function is not callable');

set local request.jwt.claims = '{"sub": "74747474-0000-0000-0000-00000000a001"}';
set local role authenticated;

select throws_ok(
  $$select check_out('74747474-0000-0000-0000-000000040003', true)$$,
  'P0001', 'E_VALIDATION', 'BR-072a: [Odjavi] on an automatic check-out 70 min old is refused');

-- BR-072a: a scan within 60 minutes of the automatic check-out is a leaving --------------
select is(scan_card('7416000001') ->> 'result', 'checked_out',
  'BR-072a: a scan 30 min after the automatic check-out checks the member out');
select is(
  (select checked_out_at::text || '|' || auto_checkout::text || '|' || checked_out_by::text
   from visits where id = '74747474-0000-0000-0000-000000040001'),
  now()::text || '|false|74747474-0000-0000-0000-00000000c001',
  'BR-072a: the check-out moves to now, by the receptionist, and is no longer automatic');
select is(
  (select count(*)::int from visits where member_id = '74747474-0000-0000-0000-000000020001'),
  1, 'BR-072a: no new visit is recorded');
select is(
  (select scan_card('7416000001') ->> 'result'), 'checked_in',
  'BR-072a: the next scan after that is a new visit');

select is(
  (select (r ->> 'result') || '|' || (r ->> 'duration_seconds')
   from (select scan_card('7416000005') as r) s),
  'checked_out|3600',
  'BR-072a: the same after the nightly check-out (BR-082), with the full duration');
select ok(
  (select not auto_checkout from visits where id = '74747474-0000-0000-0000-000000040005'),
  'BR-072a: the nightly check-out becomes a real one too');

select is(scan_card('7416000003') ->> 'result', 'checked_in',
  'BR-072a: 70 min after the automatic check-out, a scan is a new visit');
select is(
  (select checked_out_at from visits where id = '74747474-0000-0000-0000-000000040003'),
  now() - interval '70 minutes', 'BR-072a: and the old visit keeps its automatic check-out');

select is(scan_card('7416000004') ->> 'result', 'checked_in',
  'BR-072: after an ordinary check-out, a scan is a new visit');

select is(scan_card('7416000002') ->> 'result', 'checked_out',
  'BR-072: a member still inside is checked out by the scan as before');

-- BR-072a: [Odjavi] on a visit the job has just closed ---------------------------------
select is(
  (select (r ->> 'result') || '|' || (r ->> 'visit_id')
   from (select check_out('74747474-0000-0000-0000-000000040006', false) as r) s),
  'checked_out|74747474-0000-0000-0000-000000040006',
  'BR-072a: [Odjavi] on a visit closed 5 min ago by the job checks the member out now');
select is(
  (select checked_out_at::text || '|' || auto_checkout::text
   from visits where id = '74747474-0000-0000-0000-000000040006'),
  now()::text || '|false', 'BR-072a: with the real time');
select throws_ok(
  $$select check_out('74747474-0000-0000-0000-000000040006', true)$$,
  'P0001', 'E_VALIDATION', 'BR-072a: a second [Odjavi] on it is refused');
select throws_ok(
  $$select check_out('74747474-0000-0000-0000-000000040071', true)$$,
  'P0001', 'E_VALIDATION',
  'BR-072a: an automatic check-out followed by a later visit is not reopened');

select * from finish();
