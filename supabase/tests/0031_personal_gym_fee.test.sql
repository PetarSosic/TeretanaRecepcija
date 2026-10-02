-- D-99: a Personalni sale may carry the gym's fixed part, typed by any staff role, from 0
-- to the amount. Left empty, the trainer's fee applies (BR-155). It is stored in the
-- owner-only membership_finance, which a receptionist never reads (doc 04 §2).
select plan(11);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('31313131-0000-0000-0000-00000000a001', null),
  ('31313131-0000-0000-0000-00000000a002', null);
insert into gyms (id, name, timezone)
values ('31313131-0000-0000-0000-00000000b001', 'pgTAP Fiksni dio', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('31313131-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('31313131-0000-0000-0000-00000000c001', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.fd.recepcija'),
  ('31313131-0000-0000-0000-00000000c002', '31313131-0000-0000-0000-00000000b001',
   '31313131-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.fd.vlasnik');

-- Tamara trains personal clients; the gym takes €80 of each by her settings.
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
   'Bo', 'Trener', '+38267310012', 'b@pgtap.invalid', '1990-01-01',
   '31313131-0000-0000-0000-00000000c002');
insert into member_counters (gym_id, last_number)
values ('31313131-0000-0000-0000-00000000b001', 2);

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
      100, 10, 'cash', null, null, 30)$$,
  'D-99: a receptionist sells Personalni with the gym''s fixed part typed');
select lives_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020002',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      120, 8, 'card')$$,
  'D-99: and one with the field left empty');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      100, 10, 'cash', null, null, 100.01)$$,
  'E_GYM_FEE_INVALID', 'D-99: the fixed part is never more than the amount');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      100, 10, 'cash', null, null, -1)$$,
  'E_GYM_FEE_INVALID', 'D-99: nor below zero');
select throws_ok(
  $$select sell_membership('31313131-0000-0000-0000-000000020001',
      '31313131-0000-0000-0000-00000000f002', null, null, null, 'cash', null, null, 10)$$,
  'E_VALIDATION', 'D-99: only Personalni has a fixed part');
select lives_ok(
  $$select register_member('9931310001', 'Nova', 'Clanica', '+38267310001',
      'nova@pgtap.invalid', '1990-01-01',
      '31313131-0000-0000-0000-00000000f001', '31313131-0000-0000-0000-00000000d001',
      90, 6, 'cash', false, null, null, 25)$$,
  'D-99: S-05 Novi član takes it too');
select is(
  (select count(*)::int from membership_finance),
  0, 'Doc 04 §2: the receptionist reads no fixed part at all, not even the one typed');

-- What was stored, read as the database itself ---------------------------------------
reset role;
select is(
  (select mf.personal_gym_fee from membership_finance mf
   join memberships m on m.id = mf.membership_id
   where m.member_id = '31313131-0000-0000-0000-000000020001'),
  30.00::numeric, 'D-99: the typed €30 is the membership''s fixed part');
select is(
  (select mf.personal_gym_fee from membership_finance mf
   join memberships m on m.id = mf.membership_id
   where m.member_id = '31313131-0000-0000-0000-000000020002'),
  80.00::numeric, 'BR-155: left empty, the trainer''s €80 applies');
select is(
  (select mf.personal_gym_fee from membership_finance mf
   join memberships m on m.id = mf.membership_id
   join members mb on mb.id = m.member_id
   where mb.first_name = 'Nova' and mb.gym_id = '31313131-0000-0000-0000-00000000b001'),
  25.00::numeric, 'D-99: the new member''s €25');
select is(
  ((membership_shares(
     (select m.id from memberships m where m.member_id = '31313131-0000-0000-0000-000000020001'),
     100)).trainer_share),
  70.00::numeric, 'BR-155: €100 less the typed €30 leaves the trainer €70');

select * from finish();
