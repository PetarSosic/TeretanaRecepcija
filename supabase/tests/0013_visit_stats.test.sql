-- M-13: visit statistics (F-20, S-15). Who may read them, that both bar charts come back
-- complete, and that BR-082's automatic check-outs are counted as visits but left out of
-- the average duration.
select plan(14);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-00000000a001', null),
  ('dddddddd-0000-0000-0000-00000000a002', null),
  ('dddddddd-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone) values
  ('dddddddd-0000-0000-0000-00000000b001', 'pgTAP Statistika', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('dddddddd-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('dddddddd-0000-0000-0000-00000000c001', 'dddddddd-0000-0000-0000-00000000b001',
   'dddddddd-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.st.vlasnik'),
  ('dddddddd-0000-0000-0000-00000000c002', 'dddddddd-0000-0000-0000-00000000b001',
   'dddddddd-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.st.menadzer'),
  ('dddddddd-0000-0000-0000-00000000c003', 'dddddddd-0000-0000-0000-00000000b001',
   'dddddddd-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Ana', 'pgtap.st.ana');

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, is_anonymized, anonymized_at, created_by) values
  ('dddddddd-0000-0000-0000-000000010001', 'dddddddd-0000-0000-0000-00000000b001', 1,
   'Đurđa', 'Čučković', '+38267000501', 'st1@pgtap.invalid', '1990-01-01', false, null,
   'dddddddd-0000-0000-0000-00000000c001'),
  ('dddddddd-0000-0000-0000-000000010002', 'dddddddd-0000-0000-0000-00000000b001', 2,
   'Obrisan', 'Član', null, null, null, true, now(),
   'dddddddd-0000-0000-0000-00000000c001');

-- Two visits yesterday at 08:00: one of an hour, one closed by the nightly job (BR-082).
insert into visits (gym_id, member_id, visit_type, checked_in_at, checked_in_by,
                    checked_out_at, auto_checkout) values
  ('dddddddd-0000-0000-0000-00000000b001', 'dddddddd-0000-0000-0000-000000010001', 'gym',
   ((gym_today('dddddddd-0000-0000-0000-00000000b001') - 1) + time '08:00')
     at time zone 'Europe/Podgorica',
   'dddddddd-0000-0000-0000-00000000c003',
   ((gym_today('dddddddd-0000-0000-0000-00000000b001') - 1) + time '09:00')
     at time zone 'Europe/Podgorica', false),
  ('dddddddd-0000-0000-0000-00000000b001', 'dddddddd-0000-0000-0000-000000010002', 'gym',
   ((gym_today('dddddddd-0000-0000-0000-00000000b001') - 1) + time '08:00')
     at time zone 'Europe/Podgorica',
   'dddddddd-0000-0000-0000-00000000c003',
   ((gym_today('dddddddd-0000-0000-0000-00000000b001') - 1) + time '23:00')
     at time zone 'Europe/Podgorica', true);

-- Doc 06 §2: the owner reads them ------------------------------------------------------
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  (visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
               gym_today('dddddddd-0000-0000-0000-00000000b001')) ->> 'total')::int,
  2, 'US-20.1: both visits of the period are counted');

select is(
  json_array_length(
    visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 6,
                gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'days'),
  7, 'US-20.1: every day of the period is a bar, quiet ones included');

select is(
  json_array_length(
    visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
                gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'hours'),
  18, 'US-20.1: the hour chart runs from 06 to 23');

select is(
  (select (value ->> 'count')::int
   from json_array_elements(
     visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
                 gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'hours')
   where (value ->> 'hour')::int = 8),
  2, 'US-20.1: both check-ins land in the 08 column, in gym time');

select is(
  (select (value ->> 'count')::int
   from json_array_elements(
     visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
                 gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'days')
   where value ->> 'day' = (gym_today('dddddddd-0000-0000-0000-00000000b001') - 1)::text),
  2, 'US-20.1: the day of the visits carries both of them');

select is(
  (select (value ->> 'count')::int
   from json_array_elements(
     visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
                 gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'types')
   where value ->> 'type' = 'gym'),
  2, 'US-20.1: both are gym visits');

-- BR-082: the automatic check-out is not a measurement -----------------------------
select is(
  (visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
               gym_today('dddddddd-0000-0000-0000-00000000b001')) ->> 'average_seconds')::int,
  3600, 'US-20.1: the average is the one real hour, not the fifteen of the auto close');
select is(
  (visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
               gym_today('dddddddd-0000-0000-0000-00000000b001')) ->> 'measured_visits')::int,
  1, 'US-20.1: and the screen is told how many visits it was measured over');

-- BR-046: an anonymized member is in no list ---------------------------------------
select is(
  json_array_length(
    visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
                gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'top_members'),
  1, 'BR-046: the anonymized member is left out of the top ten');
select is(
  (select value ->> 'member_name'
   from json_array_elements(
     visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
                 gym_today('dddddddd-0000-0000-0000-00000000b001')) -> 'top_members')
   limit 1),
  'Đurđa Čučković', 'US-20.1: the member who came is the one listed');

select throws_ok(
  $$select visit_stats(current_date - 500, current_date)$$,
  'E_VALIDATION', 'Doc 08 §9: a period longer than a year is refused');
select throws_ok(
  $$select visit_stats(current_date, current_date - 1)$$,
  'E_VALIDATION', 'A period that ends before it begins is refused');

-- Doc 06 §2: the manager reads them, the receptionist does not ---------------------
reset role;
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (visit_stats(gym_today('dddddddd-0000-0000-0000-00000000b001') - 1,
               gym_today('dddddddd-0000-0000-0000-00000000b001')) ->> 'total')::int,
  2, 'Doc 06 §2: a manager reads the visit statistics');

reset role;
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select visit_stats(current_date - 1, current_date)$$,
  'E_FORBIDDEN', 'Doc 06 §2: a receptionist does not');

reset role;
select * from finish();
