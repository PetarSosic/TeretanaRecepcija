-- M-12: the owner's finance reports. E9 to E12 (the BR-155 shares), BR-156 over a whole
-- fixture month, BR-150 to BR-153 on the same fixtures, BR-157 (a manager gets nothing),
-- and BR-120: a back-dated record counts in finance and never in a shift.
select plan(41);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-00000000a001', null),
  ('cccccccc-0000-0000-0000-00000000a002', null),
  ('cccccccc-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone) values
  ('cccccccc-0000-0000-0000-00000000b001', 'pgTAP Finansije', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('cccccccc-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('cccccccc-0000-0000-0000-00000000c001', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.fin.vlasnik'),
  ('cccccccc-0000-0000-0000-00000000c002', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.fin.menadzer'),
  ('cccccccc-0000-0000-0000-00000000c003', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Ana', 'pgtap.fin.ana');

-- BR-020: Tamara has a fee of €80, Julija has none at all (OQ-1).
insert into trainers (id, gym_id, full_name) values
  ('cccccccc-0000-0000-0000-00000000d001', 'cccccccc-0000-0000-0000-00000000b001', 'pgTAP Tamara'),
  ('cccccccc-0000-0000-0000-00000000d002', 'cccccccc-0000-0000-0000-00000000b001', 'pgTAP Julija');
insert into trainer_finance (trainer_id, gym_id, personal_gym_fee) values
  ('cccccccc-0000-0000-0000-00000000d001', 'cccccccc-0000-0000-0000-00000000b001', 80),
  ('cccccccc-0000-0000-0000-00000000d002', 'cccccccc-0000-0000-0000-00000000b001', null);

-- BR-010: Grupni €69 at 70% of the whole, G+T €99 with €50 to the gym first.
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal, requires_trainer) values
  ('cccccccc-0000-0000-0000-00000000e001', 'cccccccc-0000-0000-0000-00000000b001',
   'pgTAP Grupni', 'group', 1, 'month', 69, false, true, false, true),
  ('cccccccc-0000-0000-0000-00000000e002', 'cccccccc-0000-0000-0000-00000000b001',
   'pgTAP G+T', 'combo', 1, 'month', 99, true, true, false, true),
  ('cccccccc-0000-0000-0000-00000000e003', 'cccccccc-0000-0000-0000-00000000b001',
   'pgTAP Personalni', 'personal', 1, 'month', null, false, false, true, true),
  ('cccccccc-0000-0000-0000-00000000e004', 'cccccccc-0000-0000-0000-00000000b001',
   'pgTAP Dnevna', 'day_pass', null, null, 10, false, false, false, false);

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('cccccccc-0000-0000-0000-000000010001', 'cccccccc-0000-0000-0000-00000000b001', 1,
   'Đurđa', 'Čučković', '+38267000301', 'e9@pgtap.invalid', '1990-01-01',
   'cccccccc-0000-0000-0000-00000000c001'),
  ('cccccccc-0000-0000-0000-000000010002', 'cccccccc-0000-0000-0000-00000000b001', 2,
   'Željko', 'Šćepanović', '+38267000302', 'e10@pgtap.invalid', '1990-01-01',
   'cccccccc-0000-0000-0000-00000000c001'),
  ('cccccccc-0000-0000-0000-000000010003', 'cccccccc-0000-0000-0000-00000000b001', 3,
   'Milica', 'Ćosić', '+38267000303', 'e11@pgtap.invalid', '1990-01-01',
   'cccccccc-0000-0000-0000-00000000c001'),
  ('cccccccc-0000-0000-0000-000000010004', 'cccccccc-0000-0000-0000-00000000b001', 4,
   'Nikola', 'Đurić', '+38267000304', 'e12@pgtap.invalid', '1990-01-01',
   'cccccccc-0000-0000-0000-00000000c001');

-- The fixture month: everything below is paid on the 10th of last month.
create temporary table fin_month as
  select date_trunc('month', gym_today('cccccccc-0000-0000-0000-00000000b001')
                             - interval '1 month')::date as first;
-- The assertions below run as `authenticated`, which owns nothing of its own.
grant select on fin_month to authenticated;

insert into shifts (id, gym_id, staff_id, started_at, closed_at, close_type) values
  ('cccccccc-0000-0000-0000-00000000f001', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-00000000c003',
   ((select first from fin_month) + 9 + time '08:00') at time zone 'Europe/Podgorica',
   ((select first from fin_month) + 9 + time '20:00') at time zone 'Europe/Podgorica',
   'manual');

-- E9 to E12: four memberships, each with the financial terms frozen at the sale.
insert into memberships (id, gym_id, member_id, plan_id, trainer_id, start_date, end_date,
                         start_reason, covers_gym, covers_group, covers_personal,
                         personal_session_limit, created_by, shift_id) values
  ('cccccccc-0000-0000-0000-000000020001', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-000000010001', 'cccccccc-0000-0000-0000-00000000e001',
   'cccccccc-0000-0000-0000-00000000d001',
   (select first from fin_month) + 9, (select first from fin_month) + 39, 'pgTAP',
   false, true, false, null, 'cccccccc-0000-0000-0000-00000000c001',
   'cccccccc-0000-0000-0000-00000000f001'),
  ('cccccccc-0000-0000-0000-000000020002', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-000000010002', 'cccccccc-0000-0000-0000-00000000e002',
   'cccccccc-0000-0000-0000-00000000d001',
   (select first from fin_month) + 9, (select first from fin_month) + 39, 'pgTAP',
   true, true, false, null, 'cccccccc-0000-0000-0000-00000000c001',
   'cccccccc-0000-0000-0000-00000000f001'),
  ('cccccccc-0000-0000-0000-000000020003', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-000000010003', 'cccccccc-0000-0000-0000-00000000e003',
   'cccccccc-0000-0000-0000-00000000d001',
   (select first from fin_month) + 9, (select first from fin_month) + 39, 'pgTAP',
   false, false, true, 10, 'cccccccc-0000-0000-0000-00000000c001',
   'cccccccc-0000-0000-0000-00000000f001'),
  ('cccccccc-0000-0000-0000-000000020004', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-000000010004', 'cccccccc-0000-0000-0000-00000000e003',
   'cccccccc-0000-0000-0000-00000000d002',
   (select first from fin_month) + 9, (select first from fin_month) + 39, 'pgTAP',
   false, false, true, 10, 'cccccccc-0000-0000-0000-00000000c001',
   'cccccccc-0000-0000-0000-00000000f001');

insert into membership_finance (membership_id, gym_id, gym_fixed_amount,
                                trainer_share_pct, personal_gym_fee) values
  ('cccccccc-0000-0000-0000-000000020001', 'cccccccc-0000-0000-0000-00000000b001', 0, 70, null),
  ('cccccccc-0000-0000-0000-000000020002', 'cccccccc-0000-0000-0000-00000000b001', 50, 100, null),
  ('cccccccc-0000-0000-0000-000000020003', 'cccccccc-0000-0000-0000-00000000b001', 0, null, 80),
  ('cccccccc-0000-0000-0000-000000020004', 'cccccccc-0000-0000-0000-00000000b001', 0, null, null);

insert into payments (id, gym_id, kind, membership_id, member_id, plan_id, amount, method,
                      paid_on, created_by, shift_id) values
  ('cccccccc-0000-0000-0000-000000030001', 'cccccccc-0000-0000-0000-00000000b001', 'membership',
   'cccccccc-0000-0000-0000-000000020001', 'cccccccc-0000-0000-0000-000000010001',
   'cccccccc-0000-0000-0000-00000000e001', 69, 'cash', (select first from fin_month) + 9,
   'cccccccc-0000-0000-0000-00000000c001', 'cccccccc-0000-0000-0000-00000000f001'),
  ('cccccccc-0000-0000-0000-000000030002', 'cccccccc-0000-0000-0000-00000000b001', 'membership',
   'cccccccc-0000-0000-0000-000000020002', 'cccccccc-0000-0000-0000-000000010002',
   'cccccccc-0000-0000-0000-00000000e002', 99, 'card', (select first from fin_month) + 9,
   'cccccccc-0000-0000-0000-00000000c001', 'cccccccc-0000-0000-0000-00000000f001'),
  ('cccccccc-0000-0000-0000-000000030003', 'cccccccc-0000-0000-0000-00000000b001', 'membership',
   'cccccccc-0000-0000-0000-000000020003', 'cccccccc-0000-0000-0000-000000010003',
   'cccccccc-0000-0000-0000-00000000e003', 120, 'cash', (select first from fin_month) + 9,
   'cccccccc-0000-0000-0000-00000000c001', 'cccccccc-0000-0000-0000-00000000f001'),
  ('cccccccc-0000-0000-0000-000000030004', 'cccccccc-0000-0000-0000-00000000b001', 'membership',
   'cccccccc-0000-0000-0000-000000020004', 'cccccccc-0000-0000-0000-000000010004',
   'cccccccc-0000-0000-0000-00000000e003', 100, 'cash', (select first from fin_month) + 9,
   'cccccccc-0000-0000-0000-00000000c001', 'cccccccc-0000-0000-0000-00000000f001');

-- BR-156: two group visits at the same class are one session; a personal visit is one.
insert into programs (id, gym_id, name, kind) values
  ('cccccccc-0000-0000-0000-000000050001', 'cccccccc-0000-0000-0000-00000000b001',
   'pgTAP Grupni trening', 'group');
-- BR-024: the slot's trainer must already be assigned to the slot's program.
insert into trainer_programs (trainer_id, program_id, gym_id) values
  ('cccccccc-0000-0000-0000-00000000d001', 'cccccccc-0000-0000-0000-000000050001',
   'cccccccc-0000-0000-0000-00000000b001');
insert into class_slots (id, gym_id, program_id, trainer_id, weekday, starts_at) values
  ('cccccccc-0000-0000-0000-000000040001', 'cccccccc-0000-0000-0000-00000000b001',
   'cccccccc-0000-0000-0000-000000050001', 'cccccccc-0000-0000-0000-00000000d001',
   1, '19:00');

insert into visits (gym_id, member_id, membership_id, visit_type, trainer_id, class_slot_id,
                    checked_in_at, checked_in_by, checked_out_at) values
  ('cccccccc-0000-0000-0000-00000000b001', 'cccccccc-0000-0000-0000-000000010001',
   'cccccccc-0000-0000-0000-000000020001', 'group', 'cccccccc-0000-0000-0000-00000000d001',
   'cccccccc-0000-0000-0000-000000040001',
   ((select first from fin_month) + 9 + time '19:00') at time zone 'Europe/Podgorica',
   'cccccccc-0000-0000-0000-00000000c003',
   ((select first from fin_month) + 9 + time '20:00') at time zone 'Europe/Podgorica'),
  ('cccccccc-0000-0000-0000-00000000b001', 'cccccccc-0000-0000-0000-000000010002',
   'cccccccc-0000-0000-0000-000000020002', 'group', 'cccccccc-0000-0000-0000-00000000d001',
   'cccccccc-0000-0000-0000-000000040001',
   ((select first from fin_month) + 9 + time '19:00') at time zone 'Europe/Podgorica',
   'cccccccc-0000-0000-0000-00000000c003',
   ((select first from fin_month) + 9 + time '20:00') at time zone 'Europe/Podgorica'),
  ('cccccccc-0000-0000-0000-00000000b001', 'cccccccc-0000-0000-0000-000000010003',
   'cccccccc-0000-0000-0000-000000020003', 'personal', 'cccccccc-0000-0000-0000-00000000d001',
   null,
   ((select first from fin_month) + 10 + time '10:00') at time zone 'Europe/Podgorica',
   'cccccccc-0000-0000-0000-00000000c003',
   ((select first from fin_month) + 10 + time '11:00') at time zone 'Europe/Podgorica');

-- BR-151: an ordinary expense and a payout to Tamara, both in the fixture month.
insert into expense_categories (id, gym_id, name, is_salary) values
  ('cccccccc-0000-0000-0000-000000060001', 'cccccccc-0000-0000-0000-00000000b001', 'pgTAP Struja', false),
  ('cccccccc-0000-0000-0000-000000060002', 'cccccccc-0000-0000-0000-00000000b001', 'pgTAP Plate', true);
insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                      trainer_id, created_by) values
  ('cccccccc-0000-0000-0000-00000000b001', (select first from fin_month) + 14,
   'cccccccc-0000-0000-0000-000000060001', 'pgTAP struja', 100, 'card', null,
   'cccccccc-0000-0000-0000-00000000c001'),
  ('cccccccc-0000-0000-0000-00000000b001', (select first from fin_month) + 20,
   'cccccccc-0000-0000-0000-000000060002', 'pgTAP isplata', 50, 'cash',
   'cccccccc-0000-0000-0000-00000000d001', 'cccccccc-0000-0000-0000-00000000c001');

-- BR-153: a bar sale of 10 × (€1.50 − €0.30).
insert into products (id, gym_id, name, current_purchase_price, sale_price) values
  ('cccccccc-0000-0000-0000-000000070001', 'cccccccc-0000-0000-0000-00000000b001',
   'pgTAP Voda', 0.30, 1.50);
insert into stock_movements (gym_id, product_id, type, quantity, unit_cost, unit_price,
                             method, created_by, shift_id, created_at) values
  ('cccccccc-0000-0000-0000-00000000b001', 'cccccccc-0000-0000-0000-000000070001', 'out',
   10, 0.30, 1.50, 'cash', 'cccccccc-0000-0000-0000-00000000c003',
   'cccccccc-0000-0000-0000-00000000f001',
   ((select first from fin_month) + 9 + time '12:00') at time zone 'Europe/Podgorica');

-- BR-155: E9 to E12 ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is((membership_shares('cccccccc-0000-0000-0000-000000020001', 69)).trainer_share,
          48.30::numeric, 'E9: Grupni €69 leaves the trainer €48.30');
select is((membership_shares('cccccccc-0000-0000-0000-000000020001', 69)).gym_share,
          20.70::numeric, 'E9: and the gym €20.70');
select is((membership_shares('cccccccc-0000-0000-0000-000000020002', 99)).trainer_share,
          49.00::numeric, 'E10: G+T €99 leaves the trainer €49.00');
select is((membership_shares('cccccccc-0000-0000-0000-000000020002', 99)).gym_share,
          50.00::numeric, 'E10: and the gym €50.00');
select is((membership_shares('cccccccc-0000-0000-0000-000000020003', 120)).trainer_share,
          40.00::numeric, 'E11: Personalni €120 with a fee of €80 leaves the trainer €40.00');
select is((membership_shares('cccccccc-0000-0000-0000-000000020003', 120)).gym_share,
          80.00::numeric, 'E11: and the gym €80.00');
select is((membership_shares('cccccccc-0000-0000-0000-000000020004', 100)).is_defined,
          false, 'E12: a trainer with no fee leaves the shares undefined');
select is((membership_shares('cccccccc-0000-0000-0000-000000020004', 100)).trainer_share,
          null, 'E12: and no number is invented for them');

-- AS-7: a personal amount below the gym fee gives zero, with the warning.
select is((membership_shares('cccccccc-0000-0000-0000-000000020003', 70)).trainer_share,
          0.00::numeric, 'AS-7: a share that would be negative becomes zero');
select is((membership_shares('cccccccc-0000-0000-0000-000000020003', 70)).warning,
          'Iznos manji od naknade teretani', 'AS-7: with the warning the owner must see');

-- BR-150 to BR-153 on the fixture month -------------------------------------------------
select is(
  (fin_summary((select first from fin_month),
               (select first from fin_month) + 27) ->> 'income')::numeric,
  403.00::numeric,
  'BR-150: €388.00 of memberships plus €15.00 of bar sales');
select is(
  (fin_summary((select first from fin_month),
               (select first from fin_month) + 27) ->> 'expenses')::numeric,
  150.00::numeric, 'BR-151: the electricity bill and the payout');
select is(
  (fin_summary((select first from fin_month),
               (select first from fin_month) + 27) ->> 'profit')::numeric,
  253.00::numeric, 'BR-152: profit is income minus expenses');
select is(
  (fin_summary((select first from fin_month),
               (select first from fin_month) + 27) ->> 'bar_profit')::numeric,
  12.00::numeric, 'BR-153: 10 × (1.50 − 0.30), shown separately');

select is(
  (select count(*)::int from json_array_elements(
     fin_income_breakdown((select first from fin_month),
                          (select first from fin_month) + 27) -> 'by_plan')),
  4, 'US-17.1 AC2: three plans and the bar');
select is(
  (select (value ->> 'total')::numeric
   from json_array_elements(
     fin_income_breakdown((select first from fin_month),
                          (select first from fin_month) + 27) -> 'by_method')
   where value ->> 'name' = 'cash'),
  304.00::numeric, 'US-17.1 AC2: €289.00 of cash payments plus €15.00 of cash sales');

-- BR-156 over the fixture month ---------------------------------------------------------
select is(
  (select (value ->> 'clients')::int
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  3, 'BR-156: Tamara has three paying clients that month');
select is(
  (select (value ->> 'group_sessions')::int
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  1, 'BR-156: two members at one class are one session');
select is(
  (select (value ->> 'personal_sessions')::int
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  1, 'BR-156: one personal visit is one session');
select is(
  (select (value ->> 'revenue')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  288.00::numeric, 'BR-156: €69 + €99 + €120 of attributed payments');
select is(
  (select (value ->> 'trainer_total')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  137.30::numeric, 'BR-156: €48.30 + €49.00 + €40.00 to pay out');
select is(
  (select (value ->> 'gym_total')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  150.70::numeric, 'BR-156: the rest is the gym''s');
select is(
  (select (value ->> 'paid_out')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  50.00::numeric, 'BR-156: the salary expense is what was already paid');
select is(
  (select (value ->> 'difference')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Tamara'),
  87.30::numeric, 'BR-156: the difference is what is still owed');

select is(
  (select (value ->> 'revenue')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Julija'),
  100.00::numeric, 'E12: Julija''s payment counts as revenue');
select is(
  (select (value ->> 'trainer_total')::numeric
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Julija'),
  0::numeric, 'E12: but it adds nothing to a share total');
select is(
  (select (value ->> 'undefined_count')::int
   from json_array_elements(fin_trainer_stats((select first from fin_month)))
   where value ->> 'trainer_name' = 'pgTAP Julija'),
  1, 'E12: and the screen is told there is one such payment');

-- BR-133: the owner's expense form -----------------------------------------------------
select is(
  (record_expense('cccccccc-0000-0000-0000-000000060001', 'pgTAP voda za pranje', 25.50,
                  (select first from fin_month) + 3, 'card', false, 'pgTAP Dobavljač',
                  'R-1', true, null)).amount,
  25.50::numeric, 'BR-133: the owner records an expense on a past day');
select throws_ok(
  $$select record_expense('cccccccc-0000-0000-0000-000000060001', 'pgTAP sjutra', 10,
                          gym_today('cccccccc-0000-0000-0000-00000000b001') + 1,
                          'cash', false, null, null, null, null)$$,
  'E_VALIDATION', 'BR-133: never a date in the future');
select throws_ok(
  $$select record_expense('cccccccc-0000-0000-0000-000000060001', 'pgTAP trener', 10,
                          gym_today('cccccccc-0000-0000-0000-00000000b001'),
                          'cash', false, null, null, null,
                          'cccccccc-0000-0000-0000-00000000d001')$$,
  'E_VALIDATION', 'BR-133: a trainer belongs only to a salary category');

-- BR-120: a back-dated record counts in finance and never in a shift --------------------
select is(
  (backdated_day_passes(2, 'cash', (select first from fin_month) + 5)).is_backdated,
  true, 'BR-120: a back-dated sale is marked as such');
select is(
  (select shift_id from payments
   where gym_id = 'cccccccc-0000-0000-0000-00000000b001' and is_backdated
   order by created_at desc limit 1),
  null, 'BR-120: and belongs to no shift');
select is(
  (shift_summary('cccccccc-0000-0000-0000-00000000f001') -> 'totals' ->> 'cash_income')::numeric,
  304.00::numeric,
  'BR-120: the shift still counts only its own €289.00 of cash plus €15.00 of sales');
select is(
  (fin_summary((select first from fin_month),
               (select first from fin_month) + 27) ->> 'income')::numeric,
  423.00::numeric, 'BR-120: but finance counts the €20.00 of back-dated day passes');

-- BR-157: none of this is a manager's or a receptionist's ------------------------------
reset role;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-00000000a002"}';
set local role authenticated;
select throws_ok(
  $$select fin_summary(current_date, current_date)$$,
  'E_FORBIDDEN', 'BR-157: a manager gets nothing from fin_summary');
select throws_ok(
  $$select fin_trainer_stats(current_date)$$,
  'E_FORBIDDEN', 'BR-157: nor from fin_trainer_stats');
select throws_ok(
  $$select fin_expenses(current_date, current_date)$$,
  'E_FORBIDDEN', 'BR-157: nor from fin_expenses');
select throws_ok(
  $$select record_expense('cccccccc-0000-0000-0000-000000060001', 'pgTAP', 10,
                          current_date, 'cash', false, null, null, null, null)$$,
  'E_FORBIDDEN', 'BR-133: and a manager records no owner expense');
select throws_ok(
  $$select backdated_day_passes(1, 'cash', current_date)$$,
  'E_FORBIDDEN', 'BR-120: back-dated entries are the owner''s alone');

reset role;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select fin_shifts(current_date, current_date)$$,
  'E_FORBIDDEN', 'BR-157: a receptionist gets nothing either');
select is(
  (select count(*)::int from membership_finance), 0,
  'Doc 07 §6: and reads no row of the owner-only finance tables');

reset role;
select * from finish();
