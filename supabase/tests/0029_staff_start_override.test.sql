-- D-97 (BR-052 step 4, P-27a): every staff role may choose the start date of a membership
-- being sold, earlier or later than the computed one. The end date follows from it, the
-- unpaid visits it covers are linked, and the reason names the role. The list-price amount
-- and back-dated sales stay the owner's.
select plan(14);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('29292929-0000-0000-0000-00000000a001', null),
  ('29292929-0000-0000-0000-00000000a002', null),
  ('29292929-0000-0000-0000-00000000a003', null),
  ('29292929-0000-0000-0000-00000000a004', null);

insert into gyms (id, name, timezone)
values ('29292929-0000-0000-0000-00000000b001', 'pgTAP Pocetak osoblje', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('29292929-0000-0000-0000-00000000b001');

-- D-57: the admin signs in with an email, everyone else with a username.
insert into staff (id, gym_id, user_id, role, full_name, email, username) values
  ('29292929-0000-0000-0000-00000000c001', '29292929-0000-0000-0000-00000000b001',
   '29292929-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', null, 'pgtap.so.recepcija'),
  ('29292929-0000-0000-0000-00000000c002', '29292929-0000-0000-0000-00000000b001',
   '29292929-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', null, 'pgtap.so.menadzer'),
  ('29292929-0000-0000-0000-00000000c003', '29292929-0000-0000-0000-00000000b001',
   '29292929-0000-0000-0000-00000000a003', 'owner', 'pgTAP Vlasnik', null, 'pgtap.so.vlasnik'),
  ('29292929-0000-0000-0000-00000000c004', '29292929-0000-0000-0000-00000000b001',
   '29292929-0000-0000-0000-00000000a004', 'admin', 'pgTAP Admin', 'pgtap.so.admin@example.com', null);

insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order) values
  ('29292929-0000-0000-0000-00000000f001', '29292929-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false, 1);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct) values
  ('29292929-0000-0000-0000-00000000f001', '29292929-0000-0000-0000-00000000b001', 0, null);

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('29292929-0000-0000-0000-000000020001', '29292929-0000-0000-0000-00000000b001', 1,
   'Ana', 'Ranije', '+38267290001', 'a@pgtap.invalid', '1990-01-01', '29292929-0000-0000-0000-00000000c003'),
  ('29292929-0000-0000-0000-000000020002', '29292929-0000-0000-0000-00000000b001', 2,
   'Bo', 'Kasnije', '+38267290002', 'b@pgtap.invalid', '1990-01-01', '29292929-0000-0000-0000-00000000c003'),
  ('29292929-0000-0000-0000-000000020003', '29292929-0000-0000-0000-00000000b001', 3,
   'Cvijeta', 'Vlasnik', '+38267290003', 'c@pgtap.invalid', '1990-01-01', '29292929-0000-0000-0000-00000000c003'),
  ('29292929-0000-0000-0000-000000020004', '29292929-0000-0000-0000-00000000b001', 4,
   'Dara', 'Admin', '+38267290004', 'd@pgtap.invalid', '1990-01-01', '29292929-0000-0000-0000-00000000c003');

insert into shifts (id, gym_id, staff_id)
values ('29292929-0000-0000-0000-000000040001', '29292929-0000-0000-0000-00000000b001',
        '29292929-0000-0000-0000-00000000c001');

-- Ana came five days ago without paying.
insert into visits (gym_id, member_id, visit_type, is_unpaid, checked_in_at, checked_out_at,
                    checked_in_by, shift_id)
select '29292929-0000-0000-0000-00000000b001', '29292929-0000-0000-0000-000000020001', 'gym', true,
       ((gym_today('29292929-0000-0000-0000-00000000b001') - 5) + time '10:00') at time zone 'Europe/Podgorica',
       ((gym_today('29292929-0000-0000-0000-00000000b001') - 5) + time '11:00') at time zone 'Europe/Podgorica',
       '29292929-0000-0000-0000-00000000c001', '29292929-0000-0000-0000-000000040001';

-- The receptionist moves the start earlier -------------------------------------------
set local request.jwt.claims = '{"sub": "29292929-0000-0000-0000-00000000a001"}';
set local role authenticated;
select is(
  (sell_membership('29292929-0000-0000-0000-000000020001', '29292929-0000-0000-0000-00000000f001',
     null, null, null, 'cash', gym_today('29292929-0000-0000-0000-00000000b001') - 7)
   ->> 'linked_visits')::int,
  1, 'D-97: a receptionist sells with a start a week ago, and the unpaid visit is linked');

-- D-97 leaves the list-price amount and back-dated sales to the owner.
select throws_ok(
  $$select sell_membership('29292929-0000-0000-0000-000000020002',
      '29292929-0000-0000-0000-00000000f001', null, 50, null, 'cash',
      gym_today('29292929-0000-0000-0000-00000000b001') - 1)$$,
  'P0001', 'E_AMOUNT_LOCKED', 'BR-059: a receptionist still cannot change a list price');
select throws_ok(
  $$select backdated_membership('29292929-0000-0000-0000-000000020002',
      '29292929-0000-0000-0000-00000000f001', null, null, null, 'cash',
      gym_today('29292929-0000-0000-0000-00000000b001') - 1,
      gym_today('29292929-0000-0000-0000-00000000b001') - 1)$$,
  'P0001', 'E_FORBIDDEN', 'BR-120: a receptionist still cannot enter a back-dated sale');

reset role;
select is(
  (select start_date from memberships where member_id = '29292929-0000-0000-0000-000000020001'),
  gym_today('29292929-0000-0000-0000-00000000b001') - 7,
  'D-97: the membership starts on the receptionist''s date');
select is(
  (select end_date from memberships where member_id = '29292929-0000-0000-0000-000000020001'),
  membership_end_date(gym_today('29292929-0000-0000-0000-00000000b001') - 7, 1, 'month'),
  'BR-051: the last valid day follows from the chosen start');
select is(
  (select start_reason from memberships where member_id = '29292929-0000-0000-0000-000000020001'),
  'Početak je odredio recepcioner.', 'D-97: the reason names the receptionist');
select is(
  (select (v.membership_id = ms.id)::text || '|' || v.is_unpaid::text
   from visits v join memberships ms on ms.member_id = v.member_id
   where v.member_id = '29292929-0000-0000-0000-000000020001'),
  'true|true', 'BR-052: the unpaid visit now belongs to the membership');
select is(
  (select p.amount::text || '|' || (p.paid_on = gym_today(p.gym_id))::text || '|' ||
          (p.shift_id = '29292929-0000-0000-0000-000000040001')::text
   from payments p where p.member_id = '29292929-0000-0000-0000-000000020001'),
  '79.00|true|true', 'BR-060 and BR-092: the full price is paid today, into the open shift');
select is(
  (select count(*)::int from memberships where member_id = '29292929-0000-0000-0000-000000020002'),
  0, 'BR-059 and BR-120: the refused sales saved nothing');

-- The manager moves the start later ---------------------------------------------------
set local request.jwt.claims = '{"sub": "29292929-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (sell_membership('29292929-0000-0000-0000-000000020002', '29292929-0000-0000-0000-00000000f001',
     null, null, null, 'card', gym_today('29292929-0000-0000-0000-00000000b001') + 10)
   ->> 'start_date')::date,
  gym_today('29292929-0000-0000-0000-00000000b001') + 10,
  'D-97: a manager sells with a start ten days from now');
reset role;
select is(
  (select start_reason || '|' || end_date::text from memberships
   where member_id = '29292929-0000-0000-0000-000000020002'),
  'Početak je odredio menadžer.|' ||
    membership_end_date(gym_today('29292929-0000-0000-0000-00000000b001') + 10, 1, 'month')::text,
  'D-97: the reason names the manager, and the end follows the start');

-- The owner and the admin keep their own words -------------------------------------------
set local request.jwt.claims = '{"sub": "29292929-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  sell_membership('29292929-0000-0000-0000-000000020003', '29292929-0000-0000-0000-00000000f001',
    null, null, null, 'cash', gym_today('29292929-0000-0000-0000-00000000b001') - 2) ->> 'reason',
  'Početak je odredio vlasnik.', 'BR-052 step 4: the reason still names the owner');
set local request.jwt.claims = '{"sub": "29292929-0000-0000-0000-00000000a004"}';
select is(
  sell_membership('29292929-0000-0000-0000-000000020004', '29292929-0000-0000-0000-00000000f001',
    null, null, null, 'cash', gym_today('29292929-0000-0000-0000-00000000b001') - 2) ->> 'reason',
  'Početak je odredio vlasnik.', 'D-58: the admin counts as the owner');

-- The computed date sent back unchanged is no override -------------------------------------
set local request.jwt.claims = '{"sub": "29292929-0000-0000-0000-00000000a001"}';
select is(
  sell_membership('29292929-0000-0000-0000-000000020003', '29292929-0000-0000-0000-00000000f001',
    null, null, null, 'cash',
    membership_end_date(gym_today('29292929-0000-0000-0000-00000000b001') - 2, 1, 'month') + 1)
   ->> 'reason',
  'Nastavlja se na članarinu koja važi do ' ||
    to_char(membership_end_date(gym_today('29292929-0000-0000-0000-00000000b001') - 2, 1, 'month'),
            'DD.MM.YYYY'),
  'BR-052 step 1: a receptionist who keeps the computed start keeps its reason');
reset role;

select * from finish();
