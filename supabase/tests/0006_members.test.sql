-- M-06: members and memberships. The worked examples E1, E2, E4, E13 and E14, BR-052
-- with unpaid visits from fixtures (E3 and E5, date logic only), the sale, registration,
-- editing, anonymization and card replacement RPCs, and the doc 07 §6 visibility.
select plan(78);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('66666666-0000-0000-0000-00000000a001', null),
  ('66666666-0000-0000-0000-00000000a002', null),
  ('66666666-0000-0000-0000-00000000a003', null);

insert into gyms (id, name, timezone)
values ('66666666-0000-0000-0000-00000000b001', 'pgTAP Clanovi', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('66666666-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('66666666-0000-0000-0000-00000000c001', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.cl.recepcija'),
  ('66666666-0000-0000-0000-00000000c002', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.cl.vlasnik'),
  ('66666666-0000-0000-0000-00000000c003', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.cl.menadzer');

-- Trainers: Tamara (group and personal, fee 80), Julija (personal, fee undefined, OQ-1),
-- Milena (group only).
insert into trainers (id, gym_id, full_name) values
  ('66666666-0000-0000-0000-00000000d001', '66666666-0000-0000-0000-00000000b001', 'pgTAP Tamara'),
  ('66666666-0000-0000-0000-00000000d002', '66666666-0000-0000-0000-00000000b001', 'pgTAP Julija'),
  ('66666666-0000-0000-0000-00000000d003', '66666666-0000-0000-0000-00000000b001', 'pgTAP Milena');
insert into trainer_finance (trainer_id, gym_id, personal_gym_fee) values
  ('66666666-0000-0000-0000-00000000d001', '66666666-0000-0000-0000-00000000b001', 80),
  ('66666666-0000-0000-0000-00000000d002', '66666666-0000-0000-0000-00000000b001', null),
  ('66666666-0000-0000-0000-00000000d003', '66666666-0000-0000-0000-00000000b001', null);
insert into programs (id, gym_id, name, kind) values
  ('66666666-0000-0000-0000-00000000e001', '66666666-0000-0000-0000-00000000b001', 'pgTAP Grupni', 'group'),
  ('66666666-0000-0000-0000-00000000e002', '66666666-0000-0000-0000-00000000b001', 'pgTAP Personalni', 'personal');
insert into trainer_programs (gym_id, trainer_id, program_id) values
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-00000000d001', '66666666-0000-0000-0000-00000000e001'),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-00000000d001', '66666666-0000-0000-0000-00000000e002'),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-00000000d002', '66666666-0000-0000-0000-00000000e002'),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-00000000d003', '66666666-0000-0000-0000-00000000e001');

-- BR-010 plans: f001 Mjesečna, f002 Nedeljna, f003 Personalni, f004 G+T,
-- f005 Mjesečna 12 termina, f006 Dnevna karta.
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order) values
  ('66666666-0000-0000-0000-00000000f001', '66666666-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false, 1),
  ('66666666-0000-0000-0000-00000000f002', '66666666-0000-0000-0000-00000000b001', 'pgTAP Nedeljna',
   'gym', 7, 'day', 39, true, false, false, null, null, false, 2),
  ('66666666-0000-0000-0000-00000000f003', '66666666-0000-0000-0000-00000000b001', 'pgTAP Personalni',
   'personal', 1, 'month', null, false, false, true, null, null, true, 3),
  ('66666666-0000-0000-0000-00000000f004', '66666666-0000-0000-0000-00000000b001', 'pgTAP G+T',
   'combo', 1, 'month', 99, true, true, false, null, 12, true, 4),
  ('66666666-0000-0000-0000-00000000f005', '66666666-0000-0000-0000-00000000b001', 'pgTAP Mjesečna 12',
   'gym', 1, 'month', 59, true, false, false, 12, null, false, 5),
  ('66666666-0000-0000-0000-00000000f006', '66666666-0000-0000-0000-00000000b001', 'pgTAP Dnevna',
   'day_pass', null, null, 10, false, false, false, null, null, false, 6);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct) values
  ('66666666-0000-0000-0000-00000000f001', '66666666-0000-0000-0000-00000000b001', 0, null),
  ('66666666-0000-0000-0000-00000000f002', '66666666-0000-0000-0000-00000000b001', 0, null),
  ('66666666-0000-0000-0000-00000000f003', '66666666-0000-0000-0000-00000000b001', 0, null),
  ('66666666-0000-0000-0000-00000000f004', '66666666-0000-0000-0000-00000000b001', 50, 100),
  ('66666666-0000-0000-0000-00000000f005', '66666666-0000-0000-0000-00000000b001', 0, null),
  ('66666666-0000-0000-0000-00000000f006', '66666666-0000-0000-0000-00000000b001', 0, null);

insert into card_batches (id, gym_id, quantity, created_by)
values ('66666666-0000-0000-0000-000000010001', '66666666-0000-0000-0000-00000000b001', 5,
        '66666666-0000-0000-0000-00000000c002');
insert into cards (gym_id, code, batch_id) values
  ('66666666-0000-0000-0000-00000000b001', '6600000001', '66666666-0000-0000-0000-000000010001'),
  ('66666666-0000-0000-0000-00000000b001', '6600000002', '66666666-0000-0000-0000-000000010001'),
  ('66666666-0000-0000-0000-00000000b001', '6600000003', '66666666-0000-0000-0000-000000010001'),
  ('66666666-0000-0000-0000-00000000b001', '6600000004', '66666666-0000-0000-0000-000000010001');

-- Members created directly for the date-logic fixtures (numbers 901+ so the counter,
-- which starts at 1 for registrations, never collides with them).
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('66666666-0000-0000-0000-000000020001', '66666666-0000-0000-0000-00000000b001', 901,
   'Ena', 'Dva', '+38267000001', 'e2@pgtap.invalid', '1990-01-01', '66666666-0000-0000-0000-00000000c002'),
  ('66666666-0000-0000-0000-000000020002', '66666666-0000-0000-0000-00000000b001', 902,
   'Ena', 'Tri', '+38267000002', 'e3@pgtap.invalid', '1990-01-01', '66666666-0000-0000-0000-00000000c002'),
  ('66666666-0000-0000-0000-000000020003', '66666666-0000-0000-0000-00000000b001', 903,
   'Ena', 'Pet', '+38267000003', 'e5@pgtap.invalid', '1990-01-01', '66666666-0000-0000-0000-00000000c002'),
  ('66666666-0000-0000-0000-000000020004', '66666666-0000-0000-0000-00000000b001', 904,
   'Ena', 'Grupa', '+38267000004', 'gr@pgtap.invalid', '1990-01-01', '66666666-0000-0000-0000-00000000c002');

-- Back-dated fixture memberships (no shift), as the owner would enter them (BR-120).
insert into memberships (id, gym_id, member_id, plan_id, start_date, end_date, start_reason,
                         covers_gym, covers_group, covers_personal, group_session_limit,
                         is_backdated, created_by) values
  -- E1 and E2: Mjesečna 12.01.2027 – 12.02.2027.
  ('66666666-0000-0000-0000-000000030001', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-000000020001', '66666666-0000-0000-0000-00000000f001',
   '2027-01-12', '2027-02-12', 'fixture', true, false, false, null, true,
   '66666666-0000-0000-0000-00000000c002'),
  -- E3: Mjesečna valid until 14.09.2026.
  ('66666666-0000-0000-0000-000000030002', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-000000020002', '66666666-0000-0000-0000-00000000f001',
   '2026-08-14', '2026-09-14', 'fixture', true, false, false, null, true,
   '66666666-0000-0000-0000-00000000c002'),
  -- E5: Nedeljna valid until 01.09.2026.
  ('66666666-0000-0000-0000-000000030003', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-000000020003', '66666666-0000-0000-0000-00000000f002',
   '2026-08-25', '2026-09-01', 'fixture', true, false, false, null, true,
   '66666666-0000-0000-0000-00000000c002');

-- E3: unpaid gym visits on 15.09 and 16.09; E5: an unpaid gym visit on 02.09; D-17: an
-- unpaid group visit that a gym plan must not link.
insert into visits (gym_id, member_id, visit_type, trainer_id, is_unpaid, checked_in_at,
                    checked_out_at, checked_in_by, is_backdated) values
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-000000020002', 'gym', null,
   true, '2026-09-15 10:00+02', '2026-09-15 11:00+02', '66666666-0000-0000-0000-00000000c001', true),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-000000020002', 'gym', null,
   true, '2026-09-16 10:00+02', '2026-09-16 11:00+02', '66666666-0000-0000-0000-00000000c001', true),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-000000020002', 'group',
   '66666666-0000-0000-0000-00000000d001',
   true, '2026-09-16 18:00+02', '2026-09-16 19:00+02', '66666666-0000-0000-0000-00000000c001', true),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-000000020003', 'gym', null,
   true, '2026-09-02 10:00+02', '2026-09-02 11:00+02', '66666666-0000-0000-0000-00000000c001', true);

-- P-29: an old back-dated payment only the owner may see.
insert into payments (gym_id, kind, member_id, amount, method, paid_on, is_backdated, created_by)
values ('66666666-0000-0000-0000-00000000b001', 'card_replacement',
        '66666666-0000-0000-0000-000000020001', 5, 'cash', '2026-01-02', true,
        '66666666-0000-0000-0000-00000000c002');

-- BR-051: E1, E4 and E14 ------------------------------------------------------------
select is(membership_end_date('2027-01-12', 1, 'month'), '2027-02-12'::date,
  'E1: Mjesečna from 12.01.2027 is valid until 12.02.2027');
select ok(membership_covers('66666666-0000-0000-0000-000000030001', 'gym', '2027-02-12'),
  'E1: a visit on 12.02 is covered (the last valid day is inclusive)');
select ok(not membership_covers('66666666-0000-0000-0000-000000030001', 'gym', '2027-02-13'),
  'E1: the day after is not covered');
select is(membership_end_date('2026-09-13', 7, 'day'), '2026-09-20'::date,
  'E4: Nedeljna from 13.09 is valid until 20.09');
select is(membership_end_date('2027-01-31', 1, 'month'), '2027-02-28'::date,
  'E14: Mjesečna from 31.01.2027 is valid until 28.02.2027');

-- BR-052: E2, E3, E5 (date logic) ------------------------------------------------------
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020001',
                         '66666666-0000-0000-0000-00000000f001', '2027-02-12')).start_date,
  '2027-02-13'::date, 'E2: a renewal paid on the last day starts the day after');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020001',
                         '66666666-0000-0000-0000-00000000f001', '2027-02-12')).end_date,
  '2027-03-13'::date, 'E2: and is valid until 13.03');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020001',
                         '66666666-0000-0000-0000-00000000f001', '2027-02-12')).reason,
  'Nastavlja se na članarinu koja važi do 12.02.2027',
  'E2: the BR-052 step 1 reason names the old end date');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020001',
                         '66666666-0000-0000-0000-00000000f003', '2027-02-12')).start_date,
  '2027-02-12'::date,
  'D-16 and D-61: Personalni shares no visit type with Mjesečna, so it starts today');

select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020002',
                         '66666666-0000-0000-0000-00000000f001', '2026-09-18')).start_date,
  '2026-09-15'::date, 'E3: the renewal starts at the first unpaid visit, 15.09');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020002',
                         '66666666-0000-0000-0000-00000000f001', '2026-09-18')).end_date,
  '2026-10-15'::date, 'E3: and is valid until 15.10');
select is(
  cardinality((calc_membership_start('66666666-0000-0000-0000-000000020002',
                                     '66666666-0000-0000-0000-00000000f001', '2026-09-18')).visit_ids),
  2, 'E3: both unpaid gym visits are linked; D-17: the group visit is not');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020002',
                         '66666666-0000-0000-0000-00000000f001', '2026-09-18')).reason,
  'Počinje od prvog neplaćenog dolaska 15.09.2026', 'E3: the step 2 reason');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020002',
                         '66666666-0000-0000-0000-00000000f004', '2026-09-18')).visit_ids,
  (select array_agg(id order by checked_in_at) from visits
   where member_id = '66666666-0000-0000-0000-000000020002'),
  'BR-052: G+T covers gym and group, so all three unpaid visits qualify');

select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020003',
                         '66666666-0000-0000-0000-00000000f002', '2026-09-15')).start_date,
  '2026-09-15'::date, 'E5: 02.09–09.09 would end before 15.09, so it starts on 15.09');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020003',
                         '66666666-0000-0000-0000-00000000f002', '2026-09-15')).end_date,
  '2026-09-22'::date, 'E5: valid until 22.09');
select is(
  cardinality((calc_membership_start('66666666-0000-0000-0000-000000020003',
                                     '66666666-0000-0000-0000-00000000f002', '2026-09-15')).visit_ids),
  0, 'E5: the 02.09 visit stays unpaid');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020003',
                         '66666666-0000-0000-0000-00000000f002', '2026-09-15')).warning,
  'Neplaćeni dolasci su stariji od trajanja ove članarine i ostaju neplaćeni.',
  'E5 and AS-9: the warning is shown');
select is(
  (calc_membership_start('66666666-0000-0000-0000-000000020004',
                         '66666666-0000-0000-0000-00000000f001', '2026-09-15')).reason,
  'Počinje danas', 'BR-052 step 3: no history means it starts on the sale date');

-- BR-054: status, including a G+T with its group sessions used up -----------------------
insert into memberships (id, gym_id, member_id, plan_id, trainer_id, start_date, end_date,
                         start_reason, covers_gym, covers_group, covers_personal,
                         gym_visit_limit, group_session_limit, is_backdated, created_by) values
  ('66666666-0000-0000-0000-000000030004', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-000000020004', '66666666-0000-0000-0000-00000000f004',
   '66666666-0000-0000-0000-00000000d001', '2026-01-01', '2026-01-31', 'fixture',
   true, true, false, null, 1, true, '66666666-0000-0000-0000-00000000c002'),
  ('66666666-0000-0000-0000-000000030005', '66666666-0000-0000-0000-00000000b001',
   '66666666-0000-0000-0000-000000020004', '66666666-0000-0000-0000-00000000f005',
   null, '2026-01-01', '2026-01-31', 'fixture',
   true, false, false, 1, null, true, '66666666-0000-0000-0000-00000000c002');
insert into visits (gym_id, member_id, membership_id, visit_type, trainer_id, checked_in_at,
                    checked_out_at, checked_in_by, is_backdated) values
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-000000020004',
   '66666666-0000-0000-0000-000000030004', 'group', '66666666-0000-0000-0000-00000000d001',
   '2026-01-10 18:00+01', '2026-01-10 19:00+01', '66666666-0000-0000-0000-00000000c001', true),
  ('66666666-0000-0000-0000-00000000b001', '66666666-0000-0000-0000-000000020004',
   '66666666-0000-0000-0000-000000030005', 'gym', null,
   '2026-01-11 10:00+01', '2026-01-11 11:00+01', '66666666-0000-0000-0000-00000000c001', true);

select is(membership_status('66666666-0000-0000-0000-000000030004', '2026-01-15'), 'active',
  'BR-054: a G+T with its group sessions used up is still Aktivna');
select ok(not membership_covers('66666666-0000-0000-0000-000000030004', 'group', '2026-01-15'),
  'BR-053: but it no longer covers a group visit (E7)');
select is(membership_status('66666666-0000-0000-0000-000000030005', '2026-01-15'), 'used_up',
  'BR-054: every covered type at its limit is Iskorištena');
select is(membership_status('66666666-0000-0000-0000-000000030005', '2025-12-31'), 'upcoming',
  'BR-054: before the start it is Buduća');
select is(membership_status('66666666-0000-0000-0000-000000030005', '2026-02-01'), 'expired',
  'BR-054: after the last valid day it is Istekla');
select is(membership_used('66666666-0000-0000-0000-000000030005', 'gym'), 1,
  'BR-055: the linked visit is counted');

-- BR-092: a sale needs an open shift -----------------------------------------------------
set local request.jwt.claims = '{"sub": "66666666-0000-0000-0000-00000000a001"}';
set local role authenticated;
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'P0001', 'E_NO_OPEN_SHIFT', 'BR-092: no open shift, no sale');

reset role;
insert into shifts (id, gym_id, staff_id)
values ('66666666-0000-0000-0000-000000040001', '66666666-0000-0000-0000-00000000b001',
        '66666666-0000-0000-0000-00000000c001');
set local role authenticated;

-- BR-033, BR-040, BR-041, BR-042: registration ---------------------------------------------
select throws_ok(
  $$select register_member('12345', 'Ana', 'Anić', '067 111 222', 'ana@pgtap.invalid',
      '1995-05-05', '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'P0001', 'E_CARD_INVALID', 'BR-070: a code that is not ten digits is invalid');
select throws_ok(
  $$select register_member('9999999999', 'Ana', 'Anić', '067 111 222', 'ana@pgtap.invalid',
      '1995-05-05', '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'P0001', 'E_CARD_UNKNOWN', 'BR-070: an unknown code is rejected');
select throws_ok(
  $$select register_member('6600000001', 'Ana', 'Anić', 'abc', 'ana@pgtap.invalid',
      '1995-05-05', '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'P0001', 'E_VALIDATION', 'BR-041: an impossible phone is rejected');
select throws_ok(
  $$select register_member('6600000001', 'Ana', 'Anić', '067 111 222', 'ana@pgtap.invalid',
      gym_today('66666666-0000-0000-0000-00000000b001') + 1,
      '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'P0001', 'E_VALIDATION', 'AS-2: a date of birth after today is rejected');
select throws_ok(
  $$select register_member('6600000001', 'Ana', 'Anić', '067 111 222', 'ana@pgtap',
      '1995-05-05', '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'P0001', 'E_VALIDATION', 'BR-040: an email without a domain is rejected');

select is(
  (register_member('6600000001', ' Ana ', 'Ćosić', '067 111 222', 'ANA@pgtap.invalid',
     '1995-05-05', '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash')
   ->> 'member_number')::int,
  1, 'BR-042: the first registration gets number 1');
select is(
  (select phone from members where member_number = 1
     and gym_id = '66666666-0000-0000-0000-00000000b001'),
  '+38267111222', 'BR-041: 067 111 222 is stored as +38267111222');
select is(
  (select email || '|' || first_name from members where member_number = 1
     and gym_id = '66666666-0000-0000-0000-00000000b001'),
  'ana@pgtap.invalid|Ana', 'BR-040: email lowercased, names trimmed');
select is(
  (select c.status::text from cards c join members m on m.id = c.member_id
   where c.code = '6600000001' and m.member_number = 1),
  'active', 'BR-033: the scanned card is assigned to the new member');
select is(
  (select count(*)::int from payments p join members m on m.id = p.member_id
   where m.member_number = 1 and m.gym_id = '66666666-0000-0000-0000-00000000b001'
     and p.kind = 'membership' and p.amount = 79 and p.method = 'cash'
     and p.shift_id = '66666666-0000-0000-0000-000000040001'
     and p.paid_on = gym_today('66666666-0000-0000-0000-00000000b001')),
  1, 'BR-060 and BR-093: one payment for the full price, today, on the open shift');
select throws_ok(
  $$select register_member('6600000001', 'Druga', 'Osoba', '067 333 444', 'd@pgtap.invalid',
      '1990-01-01', '66666666-0000-0000-0000-00000000f001', null, null, null, 'card')$$,
  'P0001', 'E_CARD_NOT_UNASSIGNED', 'BR-032: an assigned card cannot register another member');
select is(
  (register_member('6600000002', 'Druga', 'Osoba', '067 111 222', 'd@pgtap.invalid',
     '1990-01-01', '66666666-0000-0000-0000-00000000f001', null, null, null, 'card')
   ->> 'member_number')::int,
  2, 'BR-042 and AS-3: the next number, and a duplicate phone does not block the save');

-- BR-043 and BR-044 ----------------------------------------------------------------------
select is(
  (select count(*)::int from find_duplicates('067-111-222', null)),
  2, 'BR-043: both members with the same normalized phone are found');
select is(
  (select last_name from member_search('cosic') limit 1),
  'Ćosić', 'BR-044: "cosic" finds "Ćosić"');
select is(
  (select count(*)::int from member_search('111 22')),
  2, 'BR-044: partial phone digits match');
select is(
  (select member_number from member_search('2') where member_number = 2),
  2, 'BR-044: the member number matches exactly');

-- BR-059 and BR-058: amounts and trainers --------------------------------------------------
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f003', '66666666-0000-0000-0000-00000000d001', 75, 10, 'cash')$$,
  'P0001', 'E_AMOUNT_BELOW_MIN', 'E13: Personalni for €75 is rejected, the minimum is €80');
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f003', null, 120, 10, 'cash')$$,
  'P0001', 'E_TRAINER_REQUIRED', 'BR-058: Personalni needs a trainer');
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f003', '66666666-0000-0000-0000-00000000d003', 120, 10, 'cash')$$,
  'P0001', 'E_TRAINER_NOT_ASSIGNED', 'BR-023: a group-only trainer cannot take a personal client');
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f001', null, 50, null, 'cash')$$,
  'P0001', 'E_AMOUNT_LOCKED', 'BR-059: a receptionist cannot change a list price');
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f001', null, null, null, 'cash',
      gym_today('66666666-0000-0000-0000-00000000b001') + 5)$$,
  'P0001', 'E_FORBIDDEN', 'BR-052 step 4: only the owner overrides the start date');
select throws_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f006', null, null, null, 'cash')$$,
  'P0001', 'E_VALIDATION', 'US-08.1 AC1: the day pass is not a membership');

select lives_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f003', '66666666-0000-0000-0000-00000000d001', 120, 10, 'card')$$,
  'E13: Personalni for €120 with Tamara is sold');
reset role;
select is(
  (select mf.personal_gym_fee from membership_finance mf
   join memberships ms on ms.id = mf.membership_id
   where ms.member_id = '66666666-0000-0000-0000-000000020004'
     and ms.plan_id = '66666666-0000-0000-0000-00000000f003'),
  80.00::numeric, 'BR-058: the trainer fee is copied onto the membership');
select is(
  (select personal_session_limit from memberships
   where member_id = '66666666-0000-0000-0000-000000020004'
     and plan_id = '66666666-0000-0000-0000-00000000f003'),
  10::smallint, 'BR-059: the entered session count becomes the personal limit');
set local role authenticated;

select lives_ok(
  $$select sell_membership('66666666-0000-0000-0000-000000020004',
      '66666666-0000-0000-0000-00000000f004', '66666666-0000-0000-0000-00000000d001', null, null, 'cash')$$,
  'BR-058: G+T is sold with a group trainer');
reset role;
select is(
  (select mf.gym_fixed_amount || '|' || mf.trainer_share_pct from membership_finance mf
   join memberships ms on ms.id = mf.membership_id
   where ms.member_id = '66666666-0000-0000-0000-000000020004'
     and ms.plan_id = '66666666-0000-0000-0000-00000000f004' and not ms.is_backdated),
  '50.00|100.00', 'BR-050 and D-62: the G+T finance terms are frozen at sale');
select is(
  (select count(*)::int from audit_log
   where table_name in ('memberships', 'payments')
     and gym_id = '66666666-0000-0000-0000-00000000b001' and action = 'insert'
     and not (new_data ->> 'is_backdated')::boolean),
  8, 'BR-096: every membership and payment sold so far is in the audit log');

-- A sale links the member's unpaid visits (BR-052 step 2, today) -------------------------
insert into visits (gym_id, member_id, visit_type, is_unpaid, checked_in_at, checked_out_at,
                    checked_in_by, shift_id)
select '66666666-0000-0000-0000-00000000b001', m.id, 'gym', true,
       now() - interval '1 day', now() - interval '1 day' + interval '1 hour',
       '66666666-0000-0000-0000-00000000c001', '66666666-0000-0000-0000-000000040001'
from members m where m.member_number = 2 and m.gym_id = '66666666-0000-0000-0000-00000000b001';
-- Member 2 already holds a Mjesečna from registration, so a Nedeljna continues after it
-- (step 1) and the unpaid visit before it is untouched; clear that first.
update memberships set voided_at = now(), void_reason = 'test', voided_by = '66666666-0000-0000-0000-00000000c002'
where member_id = (select id from members where member_number = 2
                   and gym_id = '66666666-0000-0000-0000-00000000b001');
set local role authenticated;
select is(
  (sell_membership((select id from members where member_number = 2
                      and gym_id = '66666666-0000-0000-0000-00000000b001'),
     '66666666-0000-0000-0000-00000000f002', null, null, null, 'cash') ->> 'linked_visits')::int,
  1, 'BR-052 step 2: the unpaid visit from yesterday is linked by the sale');
select is(
  (select count(*)::int from visits v join members m on m.id = v.member_id
   where m.member_number = 2 and m.gym_id = '66666666-0000-0000-0000-00000000b001'
     and v.is_unpaid and v.membership_id is not null),
  1, 'BR-052: the linked visit keeps is_unpaid for history');

-- BR-045: edits, and the audit trail --------------------------------------------------------
select lives_ok(
  $$select update_member((select id from members where member_number = 1
      and gym_id = '66666666-0000-0000-0000-00000000b001'),
      'Ana', 'Ćosić-Novak', '+382 67 111 999', 'ana@pgtap.invalid', '1995-05-05')$$,
  'BR-045: a receptionist edits a member');
reset role;
select is(
  (select count(*)::int from audit_log a join members m on m.id::text = a.row_id
   where m.member_number = 1 and a.table_name = 'members' and a.action = 'update'),
  1, 'BR-045 and BR-096: the edit is audited');
set local role authenticated;

-- BR-034: a lost card ------------------------------------------------------------------------
select throws_ok(
  $$select replace_card((select id from members where member_number = 1
      and gym_id = '66666666-0000-0000-0000-00000000b001'), '6600000002', 'cash')$$,
  'P0001', 'E_CARD_NOT_UNASSIGNED', 'F-11 AC2: a card that is not empty is refused');
select lives_ok(
  $$select replace_card((select id from members where member_number = 1
      and gym_id = '66666666-0000-0000-0000-00000000b001'), '6600000003', 'cash')$$,
  'BR-034: the lost card is replaced');
select is(
  (select string_agg(c.code || ':' || c.status || ':' || coalesce(c.deactivated_reason, ''), ',' order by c.code)
   from cards c join members m on m.id = c.member_id
   where m.member_number = 1 and m.gym_id = '66666666-0000-0000-0000-00000000b001'),
  '6600000001:deactivated:izgubljena,6600000003:active:',
  'BR-034: the old card is deactivated as lost and the new one is active');
select is(
  (select p.amount from payments p join members m on m.id = p.member_id
   where m.member_number = 1 and p.kind = 'card_replacement'),
  5.00::numeric, 'BR-034: the fee is the current card replacement price');

-- BR-046: anonymization ------------------------------------------------------------------------
select throws_ok(
  $$select anonymize_member((select id from members where member_number = 1
      and gym_id = '66666666-0000-0000-0000-00000000b001'))$$,
  'P0001', 'E_FORBIDDEN', 'P-24: a receptionist cannot anonymize');

-- Doc 07 §6 and doc 04 §2 for the receptionist ---------------------------------------------
select is((select count(*)::int from membership_finance), 0,
  'Doc 04 §2: a receptionist reads no membership finance');
select throws_ok(
  $$select resolve_group_share('66666666-0000-0000-0000-00000000d001',
                               '66666666-0000-0000-0000-00000000f004')$$,
  '42501', null, 'Doc 04 §2: a receptionist cannot ask for a share percentage');
select throws_ok(
  $$insert into members (gym_id, member_number, first_name, last_name, phone, email,
      date_of_birth, created_by)
    values ('66666666-0000-0000-0000-00000000b001', 999, 'X', 'Y', '+38267000009',
      'x@pgtap.invalid', '1990-01-01', '66666666-0000-0000-0000-00000000c001')$$,
  '42501', null, 'Doc 04 §2: no direct insert into members');
select is(
  (select count(*)::int from payments
   where is_backdated or paid_on <> gym_today('66666666-0000-0000-0000-00000000b001')),
  0, 'P-29: a receptionist sees only today''s payments that are not back-dated');

reset role;
set local request.jwt.claims = '{"sub": "66666666-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is((select count(*)::int from membership_finance), 0,
  'Doc 04 §2: a manager reads no membership finance');
select throws_ok(
  $$select anonymize_member((select id from members where member_number = 1
      and gym_id = '66666666-0000-0000-0000-00000000b001'))$$,
  'P0001', 'E_FORBIDDEN', 'P-24: a manager cannot anonymize');

-- The owner: list-price change and anonymization -------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "66666666-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (sell_membership('66666666-0000-0000-0000-000000020001',
     '66666666-0000-0000-0000-00000000f002', null, 30, null, 'cash') ->> 'amount')::numeric,
  30.00::numeric, 'P-27: the owner may sell below the list price');
select ok((select count(*)::int from membership_finance) > 0,
  'Doc 04 §2: the owner reads membership finance');

select lives_ok(
  $$select anonymize_member((select id from members where member_number = 1
      and gym_id = '66666666-0000-0000-0000-00000000b001'))$$,
  'BR-046: the owner anonymizes a member');
select is(
  (select first_name || ' ' || last_name || '|' || coalesce(phone, '-') || '|'
          || coalesce(email, '-') || '|' || coalesce(date_of_birth::text, '-')
   from members where member_number = 1 and gym_id = '66666666-0000-0000-0000-00000000b001'),
  'Anonimizirani član #1|-|-|-', 'BR-046: the personal data is gone');
select is(
  (select c.deactivated_reason from cards c where c.code = '6600000003'),
  'anonimizirano', 'BR-046: the active card is deactivated');
select is(
  (select count(*)::int from audit_log a
   join members m on m.id::text = a.row_id and a.table_name = 'members'
   where m.member_number = 1 and m.gym_id = '66666666-0000-0000-0000-00000000b001'
     and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, ''))
         ~ '(Ćosić|Ana|67111|ana@pgtap)'),
  0, 'BR-046: no audit row keeps the old name, phone or email');
select ok(
  (select count(*)::int from audit_log a
   join members m on m.id::text = a.row_id and a.table_name = 'members'
   where m.member_number = 1 and m.gym_id = '66666666-0000-0000-0000-00000000b001') >= 2,
  'BR-096: the audit rows themselves are kept (the edit and the anonymization)');
select is(
  (select count(*)::int from member_search('anonimizirani')),
  0, 'BR-044 and BR-046: an anonymized member is not found');
select is(
  (select count(*)::int from memberships m join members mb on mb.id = m.member_id
   where mb.member_number = 1 and mb.gym_id = '66666666-0000-0000-0000-00000000b001'),
  1, 'BR-046: the memberships are kept');

reset role;
select * from finish();
