-- M-07: check-in and check-out. Every row of the BR-070 table, the worked examples E3,
-- E6, E7 and E8 end to end, and BR-071 to BR-081.
select plan(52);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-0000-0000-0000-00000000a001', null),
  ('77777777-0000-0000-0000-00000000a002', null);
insert into gyms (id, name, timezone)
values ('77777777-0000-0000-0000-00000000b001', 'pgTAP Recepcija', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('77777777-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('77777777-0000-0000-0000-00000000c001', '77777777-0000-0000-0000-00000000b001',
   '77777777-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.ci.recepcija'),
  ('77777777-0000-0000-0000-00000000c002', '77777777-0000-0000-0000-00000000b001',
   '77777777-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.ci.vlasnik');
insert into shifts (id, gym_id, staff_id)
values ('77777777-0000-0000-0000-00000000c101', '77777777-0000-0000-0000-00000000b001',
        '77777777-0000-0000-0000-00000000c001');

-- Milena runs group classes, Tamara personal training (BR-021, BR-023).
insert into trainers (id, gym_id, full_name) values
  ('77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000b001', 'pgTAP Milena'),
  ('77777777-0000-0000-0000-00000000d002', '77777777-0000-0000-0000-00000000b001', 'pgTAP Tamara');
insert into trainer_finance (trainer_id, gym_id) values
  ('77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000b001'),
  ('77777777-0000-0000-0000-00000000d002', '77777777-0000-0000-0000-00000000b001');
insert into programs (id, gym_id, name, kind) values
  ('77777777-0000-0000-0000-00000000e001', '77777777-0000-0000-0000-00000000b001', 'pgTAP Grupni', 'group'),
  ('77777777-0000-0000-0000-00000000e002', '77777777-0000-0000-0000-00000000b001', 'pgTAP Personalni', 'personal');
insert into trainer_programs (gym_id, trainer_id, program_id) values
  ('77777777-0000-0000-0000-00000000b001', '77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000e001'),
  ('77777777-0000-0000-0000-00000000b001', '77777777-0000-0000-0000-00000000d002', '77777777-0000-0000-0000-00000000e002');
-- BR-075: one of Milena's classes starts right now (local time), another in three hours.
insert into class_slots (id, gym_id, program_id, trainer_id, weekday, starts_at)
select '77777777-0000-0000-0000-00000000e101', '77777777-0000-0000-0000-00000000b001',
       '77777777-0000-0000-0000-00000000e001', '77777777-0000-0000-0000-00000000d001',
       extract(isodow from now() at time zone 'Europe/Podgorica')::smallint,
       date_trunc('minute', (now() at time zone 'Europe/Podgorica'))::time;
insert into class_slots (id, gym_id, program_id, trainer_id, weekday, starts_at)
select '77777777-0000-0000-0000-00000000e102', '77777777-0000-0000-0000-00000000b001',
       '77777777-0000-0000-0000-00000000e001', '77777777-0000-0000-0000-00000000d001',
       extract(isodow from now() at time zone 'Europe/Podgorica')::smallint,
       (date_trunc('minute', (now() at time zone 'Europe/Podgorica')) + interval '3 hours')::time;

-- Plans: f001 Mjesečna, f002 Mjesečna 12 termina, f003 Grupni, f004 G+T, f005 Personalni.
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer) values
  ('77777777-0000-0000-0000-00000000f001', '77777777-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false),
  ('77777777-0000-0000-0000-00000000f002', '77777777-0000-0000-0000-00000000b001', 'pgTAP Mjesečna 12',
   'gym', 1, 'month', 59, true, false, false, 12, null, false),
  ('77777777-0000-0000-0000-00000000f003', '77777777-0000-0000-0000-00000000b001', 'pgTAP Grupni',
   'group', 1, 'month', 69, false, true, false, null, 12, true),
  ('77777777-0000-0000-0000-00000000f004', '77777777-0000-0000-0000-00000000b001', 'pgTAP G+T',
   'combo', 1, 'month', 99, true, true, false, null, 12, true),
  ('77777777-0000-0000-0000-00000000f005', '77777777-0000-0000-0000-00000000b001', 'pgTAP Personalni',
   'personal', 1, 'month', null, false, false, true, null, null, true);
insert into plan_finance (plan_id, gym_id)
select id, gym_id from plans where gym_id = '77777777-0000-0000-0000-00000000b001';

-- Members: 1 gym-only, 2 two gym memberships, 3 E6, 4 E7, 5 E8, 6 E3, 7 Personalni,
-- 8 already inside for ten minutes.
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by)
select ('77777777-0000-0000-0000-0000000200' || lpad(n::text, 2, '0'))::uuid,
       '77777777-0000-0000-0000-00000000b001', n, 'Član', 'Broj ' || n,
       '+3826700000' || n, 'c' || n || '@pgtap.invalid', '1990-01-01',
       '77777777-0000-0000-0000-00000000c002'
from generate_series(1, 8) as n;
-- BR-042: the counter continues after the fixture members.
insert into member_counters (gym_id, last_number)
values ('77777777-0000-0000-0000-00000000b001', 8);

-- Back-dated fixture memberships around today (d = gym today).
insert into memberships (id, gym_id, member_id, plan_id, trainer_id, start_date, end_date,
                         start_reason, covers_gym, covers_group, covers_personal,
                         gym_visit_limit, group_session_limit, personal_session_limit,
                         is_backdated, created_by)
select v.id::uuid, '77777777-0000-0000-0000-00000000b001', v.member::uuid, v.plan::uuid,
       v.trainer::uuid, d + v.s, d + v.e, 'fixture', v.g, v.gr, v.p, v.gl, v.grl, v.pl, true,
       '77777777-0000-0000-0000-00000000c002'
from (select gym_today('77777777-0000-0000-0000-00000000b001') as d) today,
(values
  -- 1: Mjesečna, running.
  ('77777777-0000-0000-0000-000000030001', '77777777-0000-0000-0000-000000020001',
   '77777777-0000-0000-0000-00000000f001', null, -5, 25, true, false, false, null::smallint, null::smallint, null::smallint),
  -- 2: Mjesečna ending later and Mjesečna 12 ending sooner (BR-074).
  ('77777777-0000-0000-0000-000000030002', '77777777-0000-0000-0000-000000020002',
   '77777777-0000-0000-0000-00000000f001', null, -5, 25, true, false, false, null, null, null),
  ('77777777-0000-0000-0000-000000030003', '77777777-0000-0000-0000-000000020002',
   '77777777-0000-0000-0000-00000000f002', null, -20, 10, true, false, false, 12, null, null),
  -- 3: E6, Mjesečna 12 termina.
  ('77777777-0000-0000-0000-000000030004', '77777777-0000-0000-0000-000000020003',
   '77777777-0000-0000-0000-00000000f002', null, -5, 25, true, false, false, 12, null, null),
  -- 4: E7, G+T whose group sessions are used up (limit 1, one linked visit below).
  ('77777777-0000-0000-0000-000000030005', '77777777-0000-0000-0000-000000020004',
   '77777777-0000-0000-0000-00000000f004', '77777777-0000-0000-0000-00000000d001', -5, 25,
   true, true, false, null, 1, null),
  -- 5: E8, Grupni only.
  ('77777777-0000-0000-0000-000000030006', '77777777-0000-0000-0000-000000020005',
   '77777777-0000-0000-0000-00000000f003', '77777777-0000-0000-0000-00000000d001', -5, 25,
   false, true, false, null, 12, null),
  -- 6: E3, Mjesečna that ended the day before yesterday.
  ('77777777-0000-0000-0000-000000030007', '77777777-0000-0000-0000-000000020006',
   '77777777-0000-0000-0000-00000000f001', null, -32, -2, true, false, false, null, null, null),
  -- 7: Personalni with Tamara.
  ('77777777-0000-0000-0000-000000030008', '77777777-0000-0000-0000-000000020007',
   '77777777-0000-0000-0000-00000000f005', '77777777-0000-0000-0000-00000000d002', -5, 25,
   false, false, true, null, null, 10)
) as v(id, member, plan, trainer, s, e, g, gr, p, gl, grl, pl);

insert into visits (gym_id, member_id, membership_id, visit_type, trainer_id, checked_in_at,
                    checked_out_at, checked_in_by, is_backdated) values
  ('77777777-0000-0000-0000-00000000b001', '77777777-0000-0000-0000-000000020004',
   '77777777-0000-0000-0000-000000030005', 'group', '77777777-0000-0000-0000-00000000d001',
   now() - interval '2 days', now() - interval '2 days' + interval '1 hour',
   '77777777-0000-0000-0000-00000000c001', true);
-- 8 came in ten minutes ago, past the double-scan guard.
insert into visits (id, gym_id, member_id, visit_type, is_unpaid, checked_in_at, checked_in_by)
values ('77777777-0000-0000-0000-000000040008', '77777777-0000-0000-0000-00000000b001',
        '77777777-0000-0000-0000-000000020008', 'gym', true, now() - interval '10 minutes',
        '77777777-0000-0000-0000-00000000c001');

insert into card_batches (id, gym_id, quantity, created_by)
values ('77777777-0000-0000-0000-000000050001', '77777777-0000-0000-0000-00000000b001', 6,
        '77777777-0000-0000-0000-00000000c002');
insert into cards (gym_id, code, batch_id, status, member_id, deactivated_reason) values
  ('77777777-0000-0000-0000-00000000b001', '7700000001', '77777777-0000-0000-0000-000000050001',
   'active', '77777777-0000-0000-0000-000000020001', null),
  ('77777777-0000-0000-0000-00000000b001', '7700000002', '77777777-0000-0000-0000-000000050001',
   'deactivated', '77777777-0000-0000-0000-000000020001', 'izgubljena'),
  ('77777777-0000-0000-0000-00000000b001', '7700000003', '77777777-0000-0000-0000-000000050001',
   'unassigned', null, null),
  ('77777777-0000-0000-0000-00000000b001', '7700000006', '77777777-0000-0000-0000-000000050001',
   'active', '77777777-0000-0000-0000-000000020006', null),
  ('77777777-0000-0000-0000-00000000b001', '7700000008', '77777777-0000-0000-0000-000000050001',
   'active', '77777777-0000-0000-0000-000000020008', null),
  ('77777777-0000-0000-0000-00000000b001', '7700000009', '77777777-0000-0000-0000-000000050001',
   'unassigned', null, null);

set local request.jwt.claims = '{"sub": "77777777-0000-0000-0000-00000000a001"}';
set local role authenticated;

-- BR-070, one assertion per row of the table -------------------------------------------
select is(scan_card('12345') ->> 'result', 'invalid',
  'BR-070: not exactly ten digits is Neispravan kod kartice');
select is(scan_card(' 9999999999 ') ->> 'result', 'unknown',
  'BR-070: an unknown code is Nepoznata kartica (and the input is trimmed)');
select is(scan_card('7700000002') ->> 'result', 'deactivated',
  'BR-070: a deactivated card is refused');
select is(scan_card('7700000003') ->> 'result', 'unassigned',
  'BR-070: an unassigned card opens registration');
select is(scan_card('7700000003') ->> 'code', '7700000003',
  'BR-070: with the card attached');
select is((select count(*)::int from visits
           where gym_id = '77777777-0000-0000-0000-00000000b001' and not is_backdated
             and checked_in_at = now()), 0,
  'BR-070: none of these records anything');

-- Active card, no open visit: check-in (US-04.2: one scan, zero clicks) ---------------------
select is(scan_card('7700000001') ->> 'result', 'checked_in',
  'BR-073: with only Teretana, the scan checks the member in without a question');
select is(
  (select visit_type::text || '|' || (membership_id = '77777777-0000-0000-0000-000000030001')::text
          || '|' || is_unpaid::text || '|' || is_manual::text || '|'
          || (shift_id = '77777777-0000-0000-0000-00000000c101')::text
   from visits where member_id = '77777777-0000-0000-0000-000000020001' and checked_out_at is null),
  'gym|true|false|false|true',
  'US-04.2 AC1 and BR-074: a gym visit linked to the covering membership, on the open shift');

-- Active card with an open visit: check-out, guarded (BR-072) ---------------------------------
select is(scan_card('7700000001') ->> 'result', 'confirm_checkout',
  'BR-072: a second scan within the guard time asks first (S-03e)');
select is(
  check_out((select id from visits where member_id = '77777777-0000-0000-0000-000000020001'
             and checked_out_at is null), false) ->> 'result',
  'confirm_checkout', 'BR-072: unconfirmed, check_out still asks');
select is(
  check_out((select id from visits where member_id = '77777777-0000-0000-0000-000000020001'
             and checked_out_at is null), true) ->> 'result',
  'checked_out', 'BR-072: confirmed, the member is checked out');
select is(scan_card('7700000008') ->> 'result', 'checked_out',
  'BR-070 and BR-072: past the guard time, the scan checks out at once');
select ok(
  (select checked_out_at is not null and checked_out_by = '77777777-0000-0000-0000-00000000c001'
   from visits where id = '77777777-0000-0000-0000-000000040008'),
  'BR-072: the check-out time and who did it are stored');

-- BR-071: one open visit per member ------------------------------------------------------------
select lives_ok(
  $$select check_in('77777777-0000-0000-0000-000000020001', 'gym', null, null, null, true)$$,
  'BR-080: a manual check-in');
select ok(
  (select is_manual from visits where member_id = '77777777-0000-0000-0000-000000020001'
   and checked_out_at is null), 'BR-080: is_manual is recorded');
select throws_ok(
  $$select check_in('77777777-0000-0000-0000-000000020001', 'gym', null, null, null, false)$$,
  'P0001', 'E_MEMBER_HAS_OPEN_VISIT', 'BR-071: a member has at most one open visit');
select throws_ok(
  $$select begin_check_in('77777777-0000-0000-0000-000000020001')$$,
  'P0001', 'E_MEMBER_HAS_OPEN_VISIT', 'BR-071: the manual start refuses too');

-- BR-074: two candidates -> S-03a with the earliest-ending one first -----------------------
select is(begin_check_in('77777777-0000-0000-0000-000000020002') ->> 'result', 'choose',
  'US-04.3 AC3: two covering memberships need the selector');
select is(
  (begin_check_in('77777777-0000-0000-0000-000000020002') -> 'options' -> 'candidates' -> 'gym' -> 0 ->> 'id'),
  '77777777-0000-0000-0000-000000030003',
  'BR-074: the earliest-ending candidate comes first (the preselection)');
select is(
  (check_in('77777777-0000-0000-0000-000000020002', 'gym', '77777777-0000-0000-0000-000000030002',
            null, null, false) ->> 'covered')::boolean,
  true, 'BR-074: the receptionist may pick another candidate');
select is(
  (select membership_id from visits where member_id = '77777777-0000-0000-0000-000000020002'),
  '77777777-0000-0000-0000-000000030002'::uuid, 'BR-074: the visit is linked to the one picked');

-- E6: Mjesečna 12 termina, two visits the same day ----------------------------------------------
select is(
  (check_in('77777777-0000-0000-0000-000000020003', 'gym', null, null, null, false) ->> 'remaining')::int,
  11, 'E6: the first visit leaves 11');
select lives_ok(
  $$select check_out((select id from visits where member_id = '77777777-0000-0000-0000-000000020003'
                      and checked_out_at is null), true)$$,
  'E6: checked out in between');
select is(
  (check_in('77777777-0000-0000-0000-000000020003', 'gym', null, null, null, false) ->> 'remaining')::int,
  10, 'E6 and BR-055: the second visit the same day uses a session too');

-- E7: G+T with the group sessions used up --------------------------------------------------------
select is(
  (begin_check_in('77777777-0000-0000-0000-000000020004') -> 'options' ->> 'types'),
  '["gym","group"]', 'BR-073: Grupni is offered although its sessions are used up');
select is(
  (begin_check_in('77777777-0000-0000-0000-000000020004') -> 'options' ->> 'preselect'),
  'gym', 'BR-073: Teretana is preselected because a membership covers the gym');
select is(
  (begin_check_in('77777777-0000-0000-0000-000000020004') -> 'options' -> 'group_trainers' -> 0 ->> 'default_slot'),
  '77777777-0000-0000-0000-00000000e101',
  'BR-075 and AS-12: the class starting now is the default, not the one in three hours');
select is(
  (check_in('77777777-0000-0000-0000-000000020004', 'group', null,
            '77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000e101', false)
   ->> 'covered')::boolean,
  false, 'E7: picking Grupni gives an unpaid group visit');
select is(membership_status('77777777-0000-0000-0000-000000030005',
                            gym_today('77777777-0000-0000-0000-00000000b001')),
  'active', 'E7: the G+T is still Aktivna');
select is(
  (select class_slot_id from visits where member_id = '77777777-0000-0000-0000-000000020004'
   and checked_out_at is null),
  '77777777-0000-0000-0000-00000000e101'::uuid, 'BR-075: the chosen class is stored');
select lives_ok(
  $$select check_out((select id from visits where member_id = '77777777-0000-0000-0000-000000020004'
                      and checked_out_at is null), true)$$,
  'E7: checked out');
select is(
  (check_in('77777777-0000-0000-0000-000000020004', 'gym', null, null, null, false) ->> 'covered')::boolean,
  true, 'E7: picking Teretana is covered');

-- E8: Grupni-only member picks Teretana ------------------------------------------------------------
select is(
  (begin_check_in('77777777-0000-0000-0000-000000020005') -> 'options' ->> 'preselect'),
  'group', 'BR-073: without gym coverage, Grupni is preselected');
select is(
  (check_in('77777777-0000-0000-0000-000000020005', 'gym', null, null, null, false) ->> 'unpaid_count')::int,
  1, 'E8 and BR-078: an unpaid gym visit, N = 1 (yellow dialog)');

-- BR-075 to BR-077: trainers and slots --------------------------------------------------------------
select throws_ok(
  $$select check_in('77777777-0000-0000-0000-000000020007', 'personal', null, null, null, false)$$,
  'P0001', 'E_TRAINER_REQUIRED', 'BR-076: a personal visit needs a trainer');
select throws_ok(
  $$select check_in('77777777-0000-0000-0000-000000020007', 'personal', null,
      '77777777-0000-0000-0000-00000000d001', null, false)$$,
  'P0001', 'E_TRAINER_NOT_ASSIGNED', 'BR-023: a group-only trainer cannot run a personal visit');
select throws_ok(
  $$select check_in('77777777-0000-0000-0000-000000020007', 'group', null,
      '77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000e999', false)$$,
  'P0001', 'E_VALIDATION', 'BR-075: a slot that is not the trainer''s today is refused');
select is(
  (check_in('77777777-0000-0000-0000-000000020007', 'personal', null,
            '77777777-0000-0000-0000-00000000d002', null, false) ->> 'remaining')::int,
  9, 'BR-076: the personal visit with Tamara uses one of ten sessions');
select is(
  (select trainer_id from visits where member_id = '77777777-0000-0000-0000-000000020005'),
  null, 'BR-077: a gym visit has no trainer');

-- E3 end to end: two unpaid visits, then the renewal links them ----------------------------------
select is(
  (scan_card('7700000006') -> 'check_in' ->> 'unpaid_count')::int,
  1, 'E3: the first unpaid visit is N = 1 (yellow)');
select lives_ok(
  $$select check_out((select id from visits where member_id = '77777777-0000-0000-0000-000000020006'
                      and checked_out_at is null), true)$$,
  'E3: checked out');
select is(
  (scan_card('7700000006') -> 'check_in' ->> 'unpaid_count')::int,
  2, 'E3: the second is N = 2 (red)');
select is(unlinked_unpaid_count('77777777-0000-0000-0000-000000020006'), 2,
  'BR-079: unlinked_unpaid_count agrees');
select is(
  (sell_membership('77777777-0000-0000-0000-000000020006', '77777777-0000-0000-0000-00000000f001',
                   null, null, null, 'cash') ->> 'linked_visits')::int,
  2, 'E3: the renewal links both unpaid visits');
select is(
  (select start_date from memberships where member_id = '77777777-0000-0000-0000-000000020006'
   and not is_backdated),
  gym_today('77777777-0000-0000-0000-00000000b001'),
  'E3: the renewal starts at the first unpaid visit (today here)');
select is(unlinked_unpaid_count('77777777-0000-0000-0000-000000020006'), 0,
  'E3: nothing is left unpaid');

-- "Prijavi odmah" at registration (US-06.1 AC2) ---------------------------------------------------
select is(
  (register_member('7700000009', 'Nova', 'Članica', '067 999 000', 'nova@pgtap.invalid',
     '1999-09-09', '77777777-0000-0000-0000-00000000f001', null, null, null, 'card', true)
   -> 'check_in' ->> 'covered')::boolean,
  true, 'US-06.1 AC2: the new member is checked in, covered by the membership just sold');
select is(
  (select count(*)::int from visits v join members m on m.id = v.member_id
   where m.last_name = 'Članica' and v.checked_out_at is null),
  1, 'US-06.1 AC2: in the same transaction');

-- BR-081: "U teretani" ------------------------------------------------------------------------------
select is(
  json_array_length(reception_panel() -> 'in_gym'),
  (select count(*)::int from visits where gym_id = '77777777-0000-0000-0000-00000000b001'
   and checked_out_at is null),
  'BR-081: the panel lists every open visit');
select ok((reception_panel() ->> 'today_count')::int >= 10,
  'US-05.2 AC3: today''s visits are counted');

-- Doc 04 §2: no direct writes ---------------------------------------------------------------------
select throws_ok(
  $$insert into visits (gym_id, member_id, visit_type, checked_in_by)
    values ('77777777-0000-0000-0000-00000000b001', '77777777-0000-0000-0000-000000020007',
            'gym', '77777777-0000-0000-0000-00000000c001')$$,
  '42501', null, 'Doc 04 §2: staff cannot insert a visit directly');
select throws_ok(
  $$select perform_check_in(current_staff(), '77777777-0000-0000-0000-000000020007', 'gym',
      null, null, null, false)$$,
  '42501', null, 'The internal check-in is not callable by staff');

reset role;
select * from finish();
