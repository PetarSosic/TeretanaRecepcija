-- D-99 and D-101: a Personalni sale has one figure, the gym's fixed part, typed by any
-- staff role. It is required, it is the amount paid, it is never under the personal
-- minimum (BR-012), and the trainer's share is 0 (BR-155). S-22 sends it as the amount.
-- It is stored in the owner-only membership_finance, which a receptionist never reads
-- (doc 04 §2).
select plan(15);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('31313131-0000-0000-0000-00000000a001', null),
  ('31313131-0000-0000-0000-00000000a002', null);
insert into gyms (id, name, timezone)
values ('31313131-0000-0000-0000-00000000b001', 'pgTAP Fiksni dio', 'Europe/Podgorica');
-- The owner's minimum for Personalni is €40.
insert into gym_settings (gym_id, personal_min_price)
values ('31313131-0000-0000-0000-00000000b001', 40);
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('31313131-0000-0000-0000-00000000c001', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.fd.recepcija'),
  ('31313131-0000-0000-0000-00000000c002', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.fd.vlasnik');

-- Tamara trains personal clients; her settings still carry a fee of €80, which D-101 no
-- longer copies onto a sale.
insert into trainers (id, gym_id, full_name)
values ('31313131-0000-0000-0000-00000000d001', '31313131-0000-0000-0000-00000000b001', 'pgTAP Tamara');
insert into trainer_finance (trainer_id, gym_id, personal_gym_fee)
values ('31313131-0000-0000-0000-00000000d001', '31313131-0000-0000-0000-00000000b001', 80);
insert into programs (id, gym_id, name, kind)
values ('31313131-0000-0000-0000-00000000e001', '31313131-0000-0000-0000-00000000b001',
        'pgTAP Personalni', 'personal');
insert into trainer_programs (gym_id, trainer_id, program_id)
values ('31313131-0000-0000-0000-00000000b001', '31313131-0000-0000-0000-00000000d001',
        '31313131-0000-0000-0000-00000000e001');

insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order) values
  ('31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000b001', 'pgTAP Personalni',
   'personal', 1, 'month', null, false, false, true, null, null, true, 1),
  ('31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false, 2);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct) values
  ('31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000b001', 0, null),
  ('31313131-0000-0000-0000-00000000f002', '31313131-0000-0000-0000-00000000b001', 0, null);

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('31313131-0000-0000-0000-000000020001', '31313131-0000-0000-0000-00000000b001', 1,
   'Ana', 'Upisano', '+38267310011', 'a@pgtap.invalid', '1990-01-01',
   '31313131-0000-0000-0000-00000000c002'),
  ('31313131-0000-0000-0000-000000020002', '31313131-0000-0000-0000-00000000b001', 2,
   'Bo', 'Minimum', '+38267310012', 'b@pgtap.invalid', '1990-01-01',
   '31313131-0000-0000-0000-00000000c002'),
  ('31313131-0000-0000-0000-000000020003', '31313131-0000-0000-0000-00000000b001', 3,
   'Ceca', 'Naknadno', '+38267310013', 'c@pgtap.invalid', '1990-01-01',
   '31313131-0000-0000-0000-00000000c002');
insert into member_counters (gym_id, last_number)
values ('31313131-0000-0000-0000-00000000b001', 3);

insert into card_batches (id, gym_id, quantity, created_by)
values ('31313131-0000-0000-0000-000000010001', '31313131-0000-0000-0000-00000000b001', 1,
        '31313131-0000-0000-0000-00000000c002');
insert into cards (gym_id, code, batch_id)
values ('31313131-0000-0000-0000-00000000b001', '9931310001', '31313131-0000-0000-0000-000000010001');

insert into shifts (id, gym_id, staff_id)
values ('31313131-0000-0000-0000-000000040001', '31313131-0000-0000-0000-00000000b001',
        '31313131-0000-0000-0000-00000000c001');

-- The receptionist sells ----------------------------------------------------------
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a001"}';
set local role authenticated;

select lives_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      null, 10, 'cash', null, null, 50)$$,
  'D-101: a receptionist sells Personalni with only the gym''s fixed part');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      null, 10, 'cash')$$,
  'E_VALIDATION', 'D-101: the fixed part is required');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020002',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      null, 10, 'cash', null, null, 39.99)$$,
  'E_AMOUNT_BELOW_MIN', 'BR-012 and D-101: the fixed part is never under the €40 minimum');
select lives_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020002',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      null, 10, 'card', null, null, 40)$$,
  'BR-012 and D-101: exactly the minimum is sold');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      100, 10, 'cash', null, null, 50)$$,
  'E_GYM_FEE_INVALID', 'D-101: an amount of its own beside the fixed part is refused');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      null, 10, 'cash', null, null, -1)$$,
  'E_GYM_FEE_INVALID', 'D-99: nor is a figure below zero');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f002', null, null, null, 'cash', null, null, 10)$$,
  'E_VALIDATION', 'D-99: only Personalni has a fixed part');
select lives_ok(
  $$select register_member('9931310001', 'Nova', 'Clanica', '+38267310001',
      'nova@pgtap.invalid', '1990-01-01',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      null, 6, 'cash', false, null, null, 60)$$,
  'D-101: S-05 Novi član takes it too');
select is(
  (select count(*)::int from membership_finance),
  0, 'Doc 04 §2: the receptionist reads no fixed part at all, not even the one typed');

-- The owner's back-dated sale (S-22) ------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "31313131-0000-0000-0000-00000000a002"}';
set local role authenticated;
select lives_ok(
  $$select backdated_membership('31313131-0000-0000-0000-000000020003',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      45, 4, 'cash', gym_today('31313131-0000-0000-0000-00000000b001') - 1)$$,
  'D-101: S-22 sends the fixed part as its amount');

-- What was stored, read as the database itself ---------------------------------------
reset role;
select is(
  (select mf.personal_gym_fee || '|' || p.amount from membership_finance mf
   join memberships m on m.id = mf.membership_id
   join payments p on p.membership_id = m.id
   where m.member_id = '31313131-0000-0000-0000-000000020001'),
  '50.00|50.00', 'D-101: the typed €50 is both the fixed part and the payment, not Tamara''s €80');
select is(
  (select mf.personal_gym_fee || '|' || p.amount from membership_finance mf
   join memberships m on m.id = mf.membership_id
   join payments p on p.membership_id = m.id
   where m.member_id = '31313131-0000-0000-0000-000000020002'),
  '40.00|40.00', 'D-101: the €40 sale');
select is(
  (select mf.personal_gym_fee || '|' || p.amount from membership_finance mf
   join memberships m on m.id = mf.membership_id
   join payments p on p.membership_id = m.id
   join members mb on mb.id = m.member_id
   where mb.first_name = 'Nova' and mb.gym_id = '31313131-0000-0000-0000-00000000b001'),
  '60.00|60.00', 'D-101: the new member''s €60');
select is(
  (select mf.personal_gym_fee || '|' || p.amount || '|' || p.is_backdated from membership_finance mf
   join memberships m on m.id = mf.membership_id
   join payments p on p.membership_id = m.id
   where m.member_id = '31313131-0000-0000-0000-000000020003'),
  '45.00|45.00|true', 'D-101: the back-dated €45');
select is(
  (select s.trainer_share || '|' || s.gym_share || '|' || s.is_defined
   from membership_shares(
     (select m.id from memberships m where m.member_id = '31313131-0000-0000-0000-000000020001'),
     50) s),
  '0.00|50.00|true', 'BR-155 (D-101): the whole €50 is the gym''s, the trainer''s share is 0');

select * from finish();
