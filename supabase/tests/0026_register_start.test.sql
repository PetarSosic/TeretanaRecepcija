-- N-31 (BR-052 step 4): on S-05 "Novi član" the owner's own start date is saved, as it
-- is on S-08; since D-97 a receptionist's is too, with a reason that names them. Without
-- a date, registration starts today as before.
select plan(13);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('26262626-0000-0000-0000-00000000a001', null),
  ('26262626-0000-0000-0000-00000000a002', null);

insert into gyms (id, name, timezone)
values ('26262626-0000-0000-0000-00000000b001', 'pgTAP Pocetak', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('26262626-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('26262626-0000-0000-0000-00000000c001', '26262626-0000-0000-0000-00000000b001',
   '26262626-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.ps.recepcija'),
  ('26262626-0000-0000-0000-00000000c002', '26262626-0000-0000-0000-00000000b001',
   '26262626-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.ps.vlasnik');

insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order) values
  ('26262626-0000-0000-0000-00000000f001', '26262626-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false, 1);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct) values
  ('26262626-0000-0000-0000-00000000f001', '26262626-0000-0000-0000-00000000b001', 0, null);

insert into card_batches (id, gym_id, quantity, created_by)
values ('26262626-0000-0000-0000-000000010001', '26262626-0000-0000-0000-00000000b001', 4,
        '26262626-0000-0000-0000-00000000c002');
insert into cards (gym_id, code, batch_id) values
  ('26262626-0000-0000-0000-00000000b001', '2626000001', '26262626-0000-0000-0000-000000010001'),
  ('26262626-0000-0000-0000-00000000b001', '2626000002', '26262626-0000-0000-0000-000000010001'),
  ('26262626-0000-0000-0000-00000000b001', '2626000003', '26262626-0000-0000-0000-000000010001'),
  ('26262626-0000-0000-0000-00000000b001', '2626000004', '26262626-0000-0000-0000-000000010001');

insert into shifts (id, gym_id, staff_id)
values ('26262626-0000-0000-0000-000000040001', '26262626-0000-0000-0000-00000000b001',
        '26262626-0000-0000-0000-00000000c001');

-- One function, so PostgREST never has two candidates to choose from ---------------------
select is(
  (select count(*)::int from pg_proc
   where proname = 'register_member' and pronamespace = 'public'::regnamespace),
  1, 'N-31: the old register_member is gone, only the one with the start date is left');
select ok(
  has_function_privilege('authenticated',
    'register_member(text, text, text, text, text, date, uuid, uuid, numeric, integer, payment_method, boolean, time, date)',
    'execute')
  and not has_function_privilege('anon',
    'register_member(text, text, text, text, text, date, uuid, uuid, numeric, integer, payment_method, boolean, time, date)',
    'execute'),
  'N-31: signed-in staff may call it, anonymous callers may not');

-- The owner's start in the past -------------------------------------------------------
set local request.jwt.claims = '{"sub": "26262626-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (register_member('2626000001', 'Ana', 'Anić', '067 111 222', 'ana@pgtap.invalid', '1995-05-05',
     '26262626-0000-0000-0000-00000000f001', null, null, null, 'cash', false, null,
     gym_today('26262626-0000-0000-0000-00000000b001') - 3)
   ->> 'member_number')::int,
  1, 'N-31: the owner registers a member with a start three days ago');

reset role;
select is(
  (select ms.start_date from memberships ms join members m on m.id = ms.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 1),
  gym_today('26262626-0000-0000-0000-00000000b001') - 3,
  'N-31: the membership starts on the owner''s date, not today');
select is(
  (select ms.end_date from memberships ms join members m on m.id = ms.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 1),
  membership_end_date(gym_today('26262626-0000-0000-0000-00000000b001') - 3, 1, 'month'),
  'BR-051: the last valid day follows from the owner''s start');
select is(
  (select ms.start_reason from memberships ms join members m on m.id = ms.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 1),
  'Početak je odredio vlasnik.', 'BR-052 step 4: the reason names the owner');
select is(
  (select p.amount::text || '|' || (p.paid_on = gym_today(p.gym_id))::text
   from payments p join members m on m.id = p.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 1),
  '79.00|true', 'BR-060: the payment is the full price, paid today');

-- The owner's start in the future, with "Prijavi odmah" ---------------------------------
set local role authenticated;
select is(
  (register_member('2626000002', 'Ena', 'Buduća', '067 111 333', 'ena@pgtap.invalid', '1995-05-05',
     '26262626-0000-0000-0000-00000000f001', null, null, null, 'card', true, null,
     gym_today('26262626-0000-0000-0000-00000000b001') + 7)
   ->> 'member_number')::int,
  2, 'N-31: a start next week is saved together with today''s check-in');

reset role;
select is(
  (select ms.start_date from memberships ms join members m on m.id = ms.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 2),
  gym_today('26262626-0000-0000-0000-00000000b001') + 7,
  'N-31: the membership starts next week');
select is(
  (select v.is_unpaid::text || '|' || (v.membership_id is null)::text
   from visits v join members m on m.id = v.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 2),
  'true|true', 'BR-079: today''s visit is not covered by a membership that starts later');

-- Without a date nothing changes -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "26262626-0000-0000-0000-00000000a001"}';
set local role authenticated;
select is(
  (register_member('2626000003', 'Iva', 'Danas', '067 111 444', 'iva@pgtap.invalid', '1995-05-05',
     '26262626-0000-0000-0000-00000000f001', null, null, null, 'cash')
   -> 'membership' ->> 'start_date')::date,
  gym_today('26262626-0000-0000-0000-00000000b001'),
  'BR-052: a registration without a date starts today, as before');

-- D-97: the receptionist's own start -----------------------------------------------------
select is(
  (register_member('2626000004', 'Una', 'Ranije', '067 111 555', 'una@pgtap.invalid', '1995-05-05',
     '26262626-0000-0000-0000-00000000f001', null, null, null, 'cash', false, null,
     gym_today('26262626-0000-0000-0000-00000000b001') - 3)
   -> 'membership' ->> 'start_date')::date,
  gym_today('26262626-0000-0000-0000-00000000b001') - 3,
  'D-97: a receptionist registers a member with a start three days ago');
reset role;
select is(
  (select ms.start_reason from memberships ms join members m on m.id = ms.member_id
   where m.gym_id = '26262626-0000-0000-0000-00000000b001' and m.member_number = 4),
  'Početak je odredio recepcioner.', 'D-97: the reason names the receptionist');

select * from finish();
