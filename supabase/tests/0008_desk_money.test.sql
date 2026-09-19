-- M-08: money at the desk. E16, BR-094/BR-095 with AS-14 (no amount changes and no
-- closed-shift edits for non-owners), BR-100 day passes, and BR-132 to BR-135 expenses.
select plan(41);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('88888888-0000-0000-0000-00000000a001', null),
  ('88888888-0000-0000-0000-00000000a002', null),
  ('88888888-0000-0000-0000-00000000a003', null),
  ('88888888-0000-0000-0000-00000000a004', null);
insert into gyms (id, name, timezone)
values ('88888888-0000-0000-0000-00000000b001', 'pgTAP Novac', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('88888888-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('88888888-0000-0000-0000-00000000c001', '88888888-0000-0000-0000-00000000b001',
   '88888888-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.nov.ana'),
  ('88888888-0000-0000-0000-00000000c002', '88888888-0000-0000-0000-00000000b001',
   '88888888-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.nov.vlasnik'),
  ('88888888-0000-0000-0000-00000000c003', '88888888-0000-0000-0000-00000000b001',
   '88888888-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.nov.menadzer'),
  ('88888888-0000-0000-0000-00000000c004', '88888888-0000-0000-0000-00000000b001',
   '88888888-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Bojana', 'pgtap.nov.bojana');

-- Bojana's shift from yesterday is closed; Ana's is open now.
insert into shifts (id, gym_id, staff_id, started_at, closed_at, close_type, closed_by) values
  ('88888888-0000-0000-0000-00000000d000', '88888888-0000-0000-0000-00000000b001',
   '88888888-0000-0000-0000-00000000c004', now() - interval '1 day',
   now() - interval '20 hours', 'manual', '88888888-0000-0000-0000-00000000c004');

insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price, covers_gym) values
  ('88888888-0000-0000-0000-00000000f001', '88888888-0000-0000-0000-00000000b001',
   'pgTAP Mjesečna', 'gym', 1, 'month', 79, true);
insert into plans (id, gym_id, name, kind, price) values
  ('88888888-0000-0000-0000-00000000f006', '88888888-0000-0000-0000-00000000b001',
   'pgTAP Dnevna karta', 'day_pass', 10);
insert into plan_finance (plan_id, gym_id)
select id, gym_id from plans where gym_id = '88888888-0000-0000-0000-00000000b001';

insert into expense_categories (id, gym_id, name, is_salary, is_active) values
  ('88888888-0000-0000-0000-000000010001', '88888888-0000-0000-0000-00000000b001', 'pgTAP Struja', false, true),
  ('88888888-0000-0000-0000-000000010002', '88888888-0000-0000-0000-00000000b001', 'pgTAP Plate', true, true),
  ('88888888-0000-0000-0000-000000010003', '88888888-0000-0000-0000-00000000b001', 'pgTAP Staro', false, false);

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('88888888-0000-0000-0000-000000020001', '88888888-0000-0000-0000-00000000b001', 1,
   'Ena', 'Šesnaest', '+38267000161', 'e16@pgtap.invalid', '1990-01-01',
   '88888888-0000-0000-0000-00000000c002');

-- A payment on Bojana's closed shift, and a back-dated one (BR-120).
insert into payments (id, gym_id, kind, plan_id, quantity, amount, method, paid_on,
                      created_by, shift_id, is_backdated) values
  ('88888888-0000-0000-0000-000000030001', '88888888-0000-0000-0000-00000000b001', 'day_pass',
   '88888888-0000-0000-0000-00000000f006', 1, 10, 'cash',
   gym_today('88888888-0000-0000-0000-00000000b001') - 1,
   '88888888-0000-0000-0000-00000000c004', '88888888-0000-0000-0000-00000000d000', false),
  ('88888888-0000-0000-0000-000000030002', '88888888-0000-0000-0000-00000000b001', 'day_pass',
   '88888888-0000-0000-0000-00000000f006', 1, 10, 'cash',
   gym_today('88888888-0000-0000-0000-00000000b001') - 3,
   '88888888-0000-0000-0000-00000000c002', null, true);
-- An expense Bojana paid from the till on her closed shift yesterday.
insert into expenses (id, gym_id, spent_on, category_id, description, amount, method,
                      paid_from_till, created_by, shift_id) values
  ('88888888-0000-0000-0000-000000040001', '88888888-0000-0000-0000-00000000b001',
   gym_today('88888888-0000-0000-0000-00000000b001') - 1, '88888888-0000-0000-0000-000000010001',
   'Sijalice', 6.50, 'cash', true, '88888888-0000-0000-0000-00000000c004',
   '88888888-0000-0000-0000-00000000d000');

-- Ana ---------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-00000000a001"}';
set local role authenticated;

select throws_ok($$select sell_day_passes(2, 'cash')$$, 'P0001', 'E_NO_OPEN_SHIFT',
  'BR-100 and BR-092: day passes need an open shift');

reset role;
insert into shifts (id, gym_id, staff_id)
values ('88888888-0000-0000-0000-00000000d001', '88888888-0000-0000-0000-00000000b001',
        '88888888-0000-0000-0000-00000000c001');
set local role authenticated;

-- BR-100: day passes ---------------------------------------------------------------------
select is((sell_day_passes(3, 'card')).amount, 30.00::numeric,
  'BR-100: three passes at the current €10 price are €30');
select is(
  (select kind::text || '|' || quantity || '|' || coalesce(member_id::text, '-') || '|'
          || (shift_id = '88888888-0000-0000-0000-00000000d001')::text
   from payments where kind = 'day_pass' and paid_on = gym_today(gym_id) and not is_backdated),
  'day_pass|3|-|true', 'BR-100: no member, the quantity, on the open shift');
select throws_ok($$select sell_day_passes(0, 'cash')$$, 'P0001', 'E_VALIDATION',
  'BR-100: at least one pass');
select throws_ok($$select sell_day_passes(21, 'cash')$$, 'P0001', 'E_VALIDATION',
  'BR-100: at most twenty');

-- E16 set-up: Ana sells a Mjesečna, and three visits use it.
select lives_ok(
  $$select sell_membership('88888888-0000-0000-0000-000000020001',
      '88888888-0000-0000-0000-00000000f001', null, null, null, 'cash')$$,
  'E16: the membership is sold on the open shift');
reset role;
insert into visits (gym_id, member_id, membership_id, visit_type, checked_in_at,
                    checked_out_at, checked_in_by, shift_id)
select '88888888-0000-0000-0000-00000000b001', '88888888-0000-0000-0000-000000020001', m.id,
       'gym', now() - (n || ' hours')::interval, now() - (n || ' hours')::interval + interval '30 minutes',
       '88888888-0000-0000-0000-00000000c001', '88888888-0000-0000-0000-00000000d001'
from memberships m, generate_series(2, 4) as n
where m.member_id = '88888888-0000-0000-0000-000000020001';
set local role authenticated;

-- BR-094: corrections --------------------------------------------------------------------
select is(
  (correct_payment((select id from payments where kind = 'membership'), 'card', ' Greška na kasi ')).method,
  'card'::payment_method, 'BR-094: anyone changes the method of an open-shift payment');
select is((select note from payments where kind = 'membership'), 'Greška na kasi',
  'BR-094: and its note');
select throws_ok(
  $$select correct_payment((select id from payments where kind = 'membership'), 'card', null, 50)$$,
  'P0001', 'E_AMOUNT_LOCKED', 'BR-094: only the owner changes an amount');
select throws_ok(
  $$select correct_payment('88888888-0000-0000-0000-000000030001', 'card', null)$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'AS-14: a closed shift''s payment cannot be corrected');
select throws_ok(
  $$select void_payment('88888888-0000-0000-0000-000000030001', 'pogrešno')$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'AS-14: nor voided');

-- BR-095: voids and E16 -------------------------------------------------------------------
select throws_ok(
  $$select void_payment((select id from payments where kind = 'membership'), 'ab')$$,
  'P0001', 'E_REASON_REQUIRED', 'BR-095: a reason of at least three characters');
select lives_ok(
  $$select void_payment((select id from payments where kind = 'membership'), 'Pogrešan član')$$,
  'E16: the membership payment is voided');
select ok(
  (select voided_at is not null and void_reason = 'Pogrešan član' from memberships
   where member_id = '88888888-0000-0000-0000-000000020001'),
  'E16 and D-14: the membership is voided with it');
select is(
  (select count(*)::int from visits
   where member_id = '88888888-0000-0000-0000-000000020001'
     and membership_id is null and is_unpaid),
  3, 'E16: its three visits become unlinked unpaid visits');
select is(unlinked_unpaid_count('88888888-0000-0000-0000-000000020001'), 3,
  'BR-079: and count towards the unpaid warning');
select throws_ok(
  $$select correct_payment((select id from payments where kind = 'membership'), 'cash', null)$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'BR-095: a voided payment no longer changes');
select throws_ok(
  $$select void_payment((select id from payments where kind = 'membership'), 'još jednom')$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'BR-095: and cannot be voided twice');

-- BR-132: desk expenses ----------------------------------------------------------------------
select throws_ok(
  $$select record_desk_expense('88888888-0000-0000-0000-000000010002', 'Isplata', 20)$$,
  'P0001', 'E_CATEGORY_NOT_ALLOWED', 'BR-132 and D-37: no salary category at the desk');
select throws_ok(
  $$select record_desk_expense('88888888-0000-0000-0000-000000010003', 'Nešto', 20)$$,
  'P0001', 'E_CATEGORY_NOT_ALLOWED', 'BR-131: no deactivated category');
select throws_ok(
  $$select record_desk_expense('88888888-0000-0000-0000-000000010001', 'x', 20)$$,
  'P0001', 'E_VALIDATION', 'BR-132: a description of 2–200 characters');
select throws_ok(
  $$select record_desk_expense('88888888-0000-0000-0000-000000010001', 'Sijalice', 10000.01)$$,
  'P0001', 'E_VALIDATION', 'BR-132: at most €10,000');
select is(
  (select method::text || '|' || paid_from_till::text || '|' || (spent_on = gym_today(gym_id))::text
          || '|' || (shift_id = '88888888-0000-0000-0000-00000000d001')::text || '|' || amount
   from record_desk_expense('88888888-0000-0000-0000-000000010001', ' Deterdžent ', 4.5)),
  'cash|true|true|true|4.50', 'BR-132: cash from the till, today, on the open shift');

-- BR-134: what Ana sees --------------------------------------------------------------------
select is((select count(*)::int from expenses), 1,
  'BR-134: a receptionist sees only her own expenses of today');
select throws_ok(
  $$select void_expense('88888888-0000-0000-0000-000000040001', 'nije moj')$$,
  'P0001', 'E_FORBIDDEN', 'BR-135: nobody but the owner voids someone else''s expense');
select throws_ok(
  $$select void_expense((select id from expenses), 'x')$$,
  'P0001', 'E_REASON_REQUIRED', 'BR-135: a void needs a reason');
select lives_ok(
  $$select void_expense((select id from expenses), 'Duplo uneseno')$$,
  'BR-135: she voids her own expense of the open shift');

-- Bojana: her own expense, but its shift is closed (AS-14) ------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-00000000a004"}';
set local role authenticated;
select is((select count(*)::int from expenses), 0,
  'BR-134: yesterday''s own expense is no longer visible to a receptionist');
select throws_ok(
  $$select void_expense('88888888-0000-0000-0000-000000040001', 'kasno')$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'AS-14: nor voidable once the shift is closed');
select is((select count(*)::int from payments where is_backdated), 0,
  'P-29: back-dated payments are hidden from a receptionist');

-- The manager: same limits as the desk ---------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select correct_payment((select id from payments where kind = 'day_pass'
      and paid_on = gym_today(gym_id) and not is_backdated), 'cash', null, 25)$$,
  'P0001', 'E_AMOUNT_LOCKED', 'P-31: a manager cannot change an amount');
select throws_ok(
  $$select correct_payment('88888888-0000-0000-0000-000000030002', 'card', null)$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'AS-14: a manager cannot correct a back-dated payment');
select lives_ok(
  $$select record_desk_expense('88888888-0000-0000-0000-000000010001', 'Papir', 3)$$,
  'P-32: a manager records a desk expense on the open shift');
select is((select count(*)::int from expenses), 1,
  'BR-134: a manager too sees only their own expenses of today');

-- The owner: everything --------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is((select count(*)::int from expenses), 3,
  'BR-134: the owner sees every expense');
select is(
  (correct_payment('88888888-0000-0000-0000-000000030001', 'card', 'ispravka', 12)).amount,
  12.00::numeric, 'P-31 and AS-14: the owner changes the amount of a closed-shift payment');
select lives_ok(
  $$select void_payment('88888888-0000-0000-0000-000000030002', 'Naknadno pogrešno')$$,
  'BR-095: the owner voids a back-dated payment');
select lives_ok(
  $$select void_expense('88888888-0000-0000-0000-000000040001', 'Vlasnik poništava')$$,
  'BR-135: the owner voids any expense');
select is(
  (select count(*)::int from audit_log
   where gym_id = '88888888-0000-0000-0000-00000000b001' and action = 'void'),
  5, 'BR-096: every void is in the audit log (3 payments/memberships, 2 expenses)');
select is(
  (select count(*)::int from audit_log
   where gym_id = '88888888-0000-0000-0000-00000000b001' and action = 'update'
     and table_name = 'payments'),
  2, 'BR-096: both corrections are in the audit log with old and new values');

-- Doc 04 §2: no direct writes ---------------------------------------------------------------------
select throws_ok(
  $$insert into expenses (gym_id, spent_on, category_id, description, amount, created_by)
    values ('88888888-0000-0000-0000-00000000b001', current_date,
            '88888888-0000-0000-0000-000000010001', 'Direktno', 1,
            '88888888-0000-0000-0000-00000000c002')$$,
  '42501', null, 'Doc 04 §2: not even the owner writes an expense directly');

reset role;
select * from finish();
