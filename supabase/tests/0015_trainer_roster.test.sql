-- D-72 (BR-027): S-29 Treneri. Every role sees the group memberships valid today by
-- trainer and fixed class time, with today's check-ins to each class and the check-ins
-- by members not on its list. Only the owner and the admin receive the amounts, through
-- fin_roster_prices (BR-157).
select plan(28);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('31313131-0000-0000-0000-00000000a001', null),
  ('31313131-0000-0000-0000-00000000a002', null),
  ('31313131-0000-0000-0000-00000000a003', null),
  ('31313131-0000-0000-0000-00000000a004', null),
  ('31313131-0000-0000-0000-00000000a005', null);

insert into gyms (id, name, timezone) values
  ('31313131-0000-0000-0000-00000000b001', 'pgTAP Treneri', 'Europe/Podgorica'),
  ('31313131-0000-0000-0000-00000000b002', 'pgTAP Druga', 'Europe/Podgorica');
insert into gym_settings (gym_id) values
  ('31313131-0000-0000-0000-00000000b001'),
  ('31313131-0000-0000-0000-00000000b002');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('31313131-0000-0000-0000-00000000c001', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.tr.recepcija'),
  ('31313131-0000-0000-0000-00000000c002', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.tr.vlasnik'),
  ('31313131-0000-0000-0000-00000000c003', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadžer', 'pgtap.tr.menadzer'),
  ('31313131-0000-0000-0000-00000000c004', '31313131-0000-0000-0000-00000000b002',
   '31313131-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Druga Recepcija', 'pgtap.tr.druga'),
  ('31313131-0000-0000-0000-00000000c005', '31313131-0000-0000-0000-00000000b002',
   '31313131-0000-0000-0000-00000000a005', 'owner', 'pgTAP Drugi Vlasnik', 'pgtap.tr.drugi');

insert into trainers (id, gym_id, full_name) values
  ('31313131-0000-0000-0000-00000000d001', '31313131-0000-0000-0000-00000000b001', 'pgTAP Milena'),
  ('31313131-0000-0000-0000-00000000d002', '31313131-0000-0000-0000-00000000b001', 'pgTAP Tamara');
insert into programs (id, gym_id, name, kind) values
  ('31313131-0000-0000-0000-00000000e001', '31313131-0000-0000-0000-00000000b001', 'pgTAP Grupni', 'group');
insert into trainer_programs (gym_id, trainer_id, program_id) values
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-00000000d001', '31313131-0000-0000-0000-00000000e001'),
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-00000000d002', '31313131-0000-0000-0000-00000000e001');

-- The schedule is laid out around the gym's today (shift 0 = today, 1 = tomorrow, ...):
-- Milena at 08:00 today and tomorrow, at 18:00 the day after, and an inactive 20:00
-- today; Tamara at 19:00 tomorrow.
insert into class_slots (id, gym_id, program_id, trainer_id, weekday, starts_at, is_active)
select s.id::uuid, '31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-00000000e001',
       s.trainer::uuid, (d.today + s.shift) % 7 + 1, s.starts_at::time, s.active
from (select extract(isodow from gym_today('31313131-0000-0000-0000-00000000b001'))::int - 1
        as today) d,
     (values
       ('31313131-0000-0000-0000-000000060001', '31313131-0000-0000-0000-00000000d001', 0, '08:00', true),
       ('31313131-0000-0000-0000-000000060002', '31313131-0000-0000-0000-00000000d001', 1, '08:00', true),
       ('31313131-0000-0000-0000-000000060003', '31313131-0000-0000-0000-00000000d001', 2, '18:00', true),
       ('31313131-0000-0000-0000-000000060004', '31313131-0000-0000-0000-00000000d001', 0, '20:00', false),
       ('31313131-0000-0000-0000-000000060005', '31313131-0000-0000-0000-00000000d002', 1, '19:00', true)
     ) as s(id, trainer, shift, starts_at, active);

-- f001 Mjesečna (gym), f002 Grupni, f003 G+T.
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order) values
  ('31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false, 1),
  ('31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000b001', 'pgTAP Grupni',
   'group', 1, 'month', 69, false, true, false, null, 12, true, 2),
  ('31313131-0000-0000-0000-00000000f003', '31313131-0000-0000-0000-00000000b001', 'pgTAP G+T',
   'combo', 1, 'month', 99, true, true, false, null, 12, true, 3);

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by)
select ('31313131-0000-0000-0000-0000000200' || lpad(n::text, 2, '0'))::uuid,
       '31313131-0000-0000-0000-00000000b001', n, 'Clan', 'Broj' || n,
       '+3826731000' || lpad(n::text, 2, '0'), 'tr' || n || '@pgtap.invalid', '1990-01-01',
       '31313131-0000-0000-0000-00000000c002'
from generate_series(1, 10) as n;

-- 1 Grupni with Milena at 08:00, plus a shorter overlapping one for the same class;
-- 2 G+T with Milena at 08:00; 3 Grupni with Milena sold before D-71 (no time);
-- 4 expired yesterday; 5 voided; 6 starts tomorrow; 7 anonymized; 8 holds nothing;
-- 9 Grupni with Tamara at 19:00; 10 Mjesečna only.
insert into memberships (id, gym_id, member_id, plan_id, trainer_id, class_time, start_date,
                         end_date, start_reason, covers_gym, covers_group, covers_personal,
                         group_session_limit, is_backdated, created_by)
select v.id::uuid, '31313131-0000-0000-0000-00000000b001', v.member::uuid, v.plan::uuid,
       v.trainer::uuid, v.class_time::time, d.today + v.s, d.today + v.e, 'fixture',
       v.plan = '31313131-0000-0000-0000-00000000f001' or v.plan = '31313131-0000-0000-0000-00000000f003',
       v.plan <> '31313131-0000-0000-0000-00000000f001', false,
       case when v.plan <> '31313131-0000-0000-0000-00000000f001' then 12 end,
       true, '31313131-0000-0000-0000-00000000c002'
from (select gym_today('31313131-0000-0000-0000-00000000b001') as today) d,
     (values
       ('31313131-0000-0000-0000-000000030001', '31313131-0000-0000-0000-000000020001',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', '08:00', -3, 27),
       ('31313131-0000-0000-0000-000000030011', '31313131-0000-0000-0000-000000020001',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', '08:00', -10, 5),
       ('31313131-0000-0000-0000-000000030002', '31313131-0000-0000-0000-000000020002',
        '31313131-0000-0000-0000-00000000f003', '31313131-0000-0000-0000-00000000d001', '08:00', -1, 29),
       ('31313131-0000-0000-0000-000000030003', '31313131-0000-0000-0000-000000020003',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', null, -5, 25),
       ('31313131-0000-0000-0000-000000030004', '31313131-0000-0000-0000-000000020004',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', '08:00', -31, -1),
       ('31313131-0000-0000-0000-000000030005', '31313131-0000-0000-0000-000000020005',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', '08:00', 0, 30),
       ('31313131-0000-0000-0000-000000030006', '31313131-0000-0000-0000-000000020006',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', '08:00', 1, 31),
       ('31313131-0000-0000-0000-000000030007', '31313131-0000-0000-0000-000000020007',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d001', '08:00', -2, 28),
       ('31313131-0000-0000-0000-000000030009', '31313131-0000-0000-0000-000000020009',
        '31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000d002', '19:00', -2, 28),
       ('31313131-0000-0000-0000-000000030010', '31313131-0000-0000-0000-000000020010',
        '31313131-0000-0000-0000-00000000f001', null, null, -2, 28)
     ) as v(id, member, plan, trainer, class_time, s, e);

insert into payments (gym_id, kind, membership_id, member_id, plan_id, amount, method, paid_on,
                      is_backdated, created_by)
select '31313131-0000-0000-0000-00000000b001', 'membership', ms.id, ms.member_id, ms.plan_id,
       case when ms.plan_id = '31313131-0000-0000-0000-00000000f003' then 99 else 69 end,
       'cash', least(ms.start_date, gym_today('31313131-0000-0000-0000-00000000b001')), true,
       '31313131-0000-0000-0000-00000000c002'
from memberships ms
where ms.gym_id = '31313131-0000-0000-0000-00000000b001';

-- BR-095: member 5's sale is voided, membership and payment alike.
update memberships
set voided_at = now(), void_reason = 'test', voided_by = '31313131-0000-0000-0000-00000000c002'
where id = '31313131-0000-0000-0000-000000030005';
update payments
set voided_at = now(), void_reason = 'test', voided_by = '31313131-0000-0000-0000-00000000c002'
where membership_id = '31313131-0000-0000-0000-000000030005';
update members set is_anonymized = true where id = '31313131-0000-0000-0000-000000020007';

-- Today: 1 came to Milena's 08:00; 2 came to a group visit with no slot, and to the 08:00
-- yesterday; 8 came unpaid and 9 (Tamara's member) paid, both to Milena's 08:00.
insert into visits (gym_id, member_id, membership_id, visit_type, trainer_id, class_slot_id,
                    is_unpaid, checked_in_at, checked_out_at, checked_in_by) values
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-000000020001',
   '31313131-0000-0000-0000-000000030001', 'group', '31313131-0000-0000-0000-00000000d001',
   '31313131-0000-0000-0000-000000060001', false, now(), null,
   '31313131-0000-0000-0000-00000000c001'),
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-000000020002',
   '31313131-0000-0000-0000-000000030002', 'group', '31313131-0000-0000-0000-00000000d001',
   null, false, now(), null, '31313131-0000-0000-0000-00000000c001'),
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-000000020002',
   '31313131-0000-0000-0000-000000030002', 'group', '31313131-0000-0000-0000-00000000d001',
   '31313131-0000-0000-0000-000000060001', false, now() - interval '26 hours',
   now() - interval '25 hours', '31313131-0000-0000-0000-00000000c001'),
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-000000020008',
   null, 'group', '31313131-0000-0000-0000-00000000d001',
   '31313131-0000-0000-0000-000000060001', true, now(), null,
   '31313131-0000-0000-0000-00000000c001'),
  ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-000000020009',
   '31313131-0000-0000-0000-000000030009', 'group', '31313131-0000-0000-0000-00000000d001',
   '31313131-0000-0000-0000-000000060001', false, now(), null,
   '31313131-0000-0000-0000-00000000c001');

-- The roster, as a receptionist (BR-027) ------------------------------------------------
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a001"}';
set local role authenticated;

select lives_ok($$select trainer_roster()$$, 'D-72: a receptionist opens the roster');
select is(
  (trainer_roster() ->> 'weekday')::int,
  extract(isodow from gym_today('31313131-0000-0000-0000-00000000b001'))::int,
  'BR-001: the weekday is the gym''s today');

select is(
  json_array_length(trainer_roster() -> 'times'), 3,
  'BR-027: every active class time, one per trainer and start time');
select is(
  (select json_array_length(t -> 'weekdays')
   from json_array_elements(trainer_roster() -> 'times') t
   where t ->> 'trainer_id' = '31313131-0000-0000-0000-00000000d001'
     and t ->> 'starts_at' = '08:00:00'),
  2, 'BR-027: a time lists every day it is held');
select ok(
  (select (t -> 'weekdays')::jsonb
            @> to_jsonb(extract(isodow from gym_today('31313131-0000-0000-0000-00000000b001'))::int)
   from json_array_elements(trainer_roster() -> 'times') t
   where t ->> 'trainer_id' = '31313131-0000-0000-0000-00000000d001'
     and t ->> 'starts_at' = '08:00:00'),
  'BR-027: Milena''s 08:00 is held today');
select is(
  (select count(*)::int from json_array_elements(trainer_roster() -> 'times') t
   where t ->> 'starts_at' = '20:00:00'),
  0, 'BR-025: an inactive slot is not a class time');
select is(
  (select json_array_length(t -> 'weekdays')
   from json_array_elements(trainer_roster() -> 'times') t
   where t ->> 'trainer_id' = '31313131-0000-0000-0000-00000000d002'),
  1, 'BR-027: Tamara''s 19:00 is listed without members of today');

select is(
  (select array_agg((m ->> 'member_number')::int order by (m ->> 'member_number')::int)
   from json_array_elements(trainer_roster() -> 'members') m),
  array[1, 2, 3, 9],
  'BR-027: only group memberships valid today, not expired, voided, upcoming, anonymized or gym-only');
select is(
  (select m ->> 'membership_id' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 1),
  '31313131-0000-0000-0000-000000030001',
  'BR-027: two memberships for one class list the member once, with the longer one');
select is(
  (select m ->> 'paid_on' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 1),
  (gym_today('31313131-0000-0000-0000-00000000b001') - 3)::text,
  'BR-027: the payment day of the membership');
select is(
  (select m ->> 'class_time' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 3),
  null::text, 'BR-027: a membership sold before D-71 comes with no class time');
select is(
  (select m ->> 'class_time' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 9),
  '19:00:00', 'BR-027: Tamara''s member is in her 19:00');

select isnt(
  (select m ->> 'checked_in_at' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 1),
  null::text, 'BR-027: a check-in today to the class is shown');
select is(
  (select m ->> 'checked_in_at' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 2),
  null::text, 'BR-027: a visit without a slot, or to the class yesterday, is not attendance');
select is(
  (select m ->> 'checked_in_at' from json_array_elements(trainer_roster() -> 'members') m
   where (m ->> 'member_number')::int = 9),
  null::text, 'BR-027: a check-in to another trainer''s class is not attendance at one''s own');

select is(
  (select array_agg((e ->> 'member_number')::int order by (e ->> 'member_number')::int)
   from json_array_elements(trainer_roster() -> 'extras') e),
  array[8, 9], 'BR-027: the check-ins to a class by members not on its list');
select is(
  (select string_agg((e ->> 'member_number') || ':' || (e ->> 'is_unpaid'), ','
                     order by (e ->> 'member_number')::int)
   from json_array_elements(trainer_roster() -> 'extras') e),
  '8:true,9:false', 'BR-027: an unpaid visit is marked as such');
select is(
  (select count(*)::int from json_array_elements(trainer_roster() -> 'extras') e
   where e ->> 'trainer_id' = '31313131-0000-0000-0000-00000000d001'
     and e ->> 'class_time' = '08:00:00'),
  2, 'BR-027: both are shown with Milena''s 08:00');

select ok(
  not exists (select 1 from json_array_elements(trainer_roster() -> 'members') m
              where m::jsonb ? 'amount'),
  'BR-157: the roster carries no amount');
select throws_ok(
  $$select fin_roster_prices(array['31313131-0000-0000-0000-000000030001']::uuid[])$$,
  'P0001', 'E_FORBIDDEN', 'BR-157: a receptionist cannot read the amounts');

-- The manager and another gym -------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  json_array_length(trainer_roster() -> 'members'), 4, 'D-72: a manager opens the roster');
select throws_ok(
  $$select fin_roster_prices(array['31313131-0000-0000-0000-000000030001']::uuid[])$$,
  'P0001', 'E_FORBIDDEN', 'BR-157: nor can a manager');

reset role;
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a004"}';
set local role authenticated;
select is(
  json_array_length(trainer_roster() -> 'times')
    + json_array_length(trainer_roster() -> 'members')
    + json_array_length(trainer_roster() -> 'extras'),
  0, 'Doc 04 §1: another gym''s receptionist sees none of it');

reset role;
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a005"}';
set local role authenticated;
select is(
  json_array_length(fin_roster_prices(array['31313131-0000-0000-0000-000000030001']::uuid[])),
  0, 'Doc 04 §1: another gym''s owner gets no amount of this gym');

-- The owner's amounts ------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (select string_agg(p ->> 'amount', ',' order by p ->> 'membership_id')
   from json_array_elements(fin_roster_prices(array[
     '31313131-0000-0000-0000-000000030001',
     '31313131-0000-0000-0000-000000030002',
     '31313131-0000-0000-0000-000000030005']::uuid[])) p),
  '69.00,99.00', 'BR-027: the owner gets each amount as decimal text, a voided one excepted');
reset role;

-- Privileges ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'trainer_roster()', 'execute'),
  'Doc 08 §4: anon cannot read the roster');
select ok(not has_function_privilege('anon', 'fin_roster_prices(uuid[])', 'execute'),
  'Doc 08 §4: anon cannot read the amounts');
select ok(has_function_privilege('authenticated', 'trainer_roster()', 'execute'),
  'Doc 08 §4: signed-in staff can call the roster, which checks the rest');

select * from finish();
