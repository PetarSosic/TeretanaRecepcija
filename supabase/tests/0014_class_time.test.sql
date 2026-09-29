-- D-71 (BR-058a): the fixed class time of a group membership. A plan that covers group
-- training needs one of the chosen trainer's active times at sale (S-05, S-08, S-22),
-- and any staff role may change it later on S-07 without a new sale.
select plan(36);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('30303030-0000-0000-0000-00000000a001', null),
  ('30303030-0000-0000-0000-00000000a002', null),
  ('30303030-0000-0000-0000-00000000a003', null);

insert into gyms (id, name, timezone) values
  ('30303030-0000-0000-0000-00000000b001', 'pgTAP Termini', 'Europe/Podgorica'),
  ('30303030-0000-0000-0000-00000000b002', 'pgTAP Druga', 'Europe/Podgorica');
insert into gym_settings (gym_id) values
  ('30303030-0000-0000-0000-00000000b001'),
  ('30303030-0000-0000-0000-00000000b002');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('30303030-0000-0000-0000-00000000c001', '30303030-0000-0000-0000-00000000b001',
   '30303030-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.ct.recepcija'),
  ('30303030-0000-0000-0000-00000000c002', '30303030-0000-0000-0000-00000000b001',
   '30303030-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.ct.vlasnik'),
  ('30303030-0000-0000-0000-00000000c003', '30303030-0000-0000-0000-00000000b002',
   '30303030-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Druga Recepcija', 'pgtap.ct.druga');

-- Milena: group, 08:00 and 18:00 on Tue/Thu/Sat, plus an inactive 20:00 on Tuesday.
-- Tamara: group, 19:00 on Mon/Wed/Fri. Julija: group, but no active time at all.
insert into trainers (id, gym_id, full_name) values
  ('30303030-0000-0000-0000-00000000d001', '30303030-0000-0000-0000-00000000b001', 'pgTAP Milena'),
  ('30303030-0000-0000-0000-00000000d002', '30303030-0000-0000-0000-00000000b001', 'pgTAP Tamara'),
  ('30303030-0000-0000-0000-00000000d003', '30303030-0000-0000-0000-00000000b001', 'pgTAP Julija');
insert into programs (id, gym_id, name, kind, is_active) values
  ('30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000b001', 'pgTAP Grupni', 'group', true),
  ('30303030-0000-0000-0000-00000000e002', '30303030-0000-0000-0000-00000000b001', 'pgTAP Stari grupni', 'group', false);
insert into trainer_programs (gym_id, trainer_id, program_id) values
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000d001', '30303030-0000-0000-0000-00000000e001'),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000d002', '30303030-0000-0000-0000-00000000e001'),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000d003', '30303030-0000-0000-0000-00000000e001'),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000d003', '30303030-0000-0000-0000-00000000e002');
insert into class_slots (gym_id, program_id, trainer_id, weekday, starts_at, is_active) values
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 2, '08:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 4, '08:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 6, '08:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 2, '18:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 4, '18:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 6, '18:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d001', 2, '20:00', false),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d002', 1, '19:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d002', 3, '19:00', true),
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e001', '30303030-0000-0000-0000-00000000d002', 5, '19:00', true),
  -- Julija's only slot is active, but its program is not (BR-025).
  ('30303030-0000-0000-0000-00000000b001', '30303030-0000-0000-0000-00000000e002', '30303030-0000-0000-0000-00000000d003', 1, '10:00', true);

-- f001 Mjesečna (gym), f002 Grupni, f003 G+T.
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order) values
  ('30303030-0000-0000-0000-00000000f001', '30303030-0000-0000-0000-00000000b001', 'pgTAP Mjesečna',
   'gym', 1, 'month', 79, true, false, false, null, null, false, 1),
  ('30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000b001', 'pgTAP Grupni',
   'group', 1, 'month', 69, false, true, false, null, 12, true, 2),
  ('30303030-0000-0000-0000-00000000f003', '30303030-0000-0000-0000-00000000b001', 'pgTAP G+T',
   'combo', 1, 'month', 99, true, true, false, null, 12, true, 3);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct) values
  ('30303030-0000-0000-0000-00000000f001', '30303030-0000-0000-0000-00000000b001', 0, null),
  ('30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000b001', 0, 70),
  ('30303030-0000-0000-0000-00000000f003', '30303030-0000-0000-0000-00000000b001', 50, 100);

insert into card_batches (id, gym_id, quantity, created_by)
values ('30303030-0000-0000-0000-000000010001', '30303030-0000-0000-0000-00000000b001', 2,
        '30303030-0000-0000-0000-00000000c002');
insert into cards (gym_id, code, batch_id) values
  ('30303030-0000-0000-0000-00000000b001', '3030000001', '30303030-0000-0000-0000-000000010001'),
  ('30303030-0000-0000-0000-00000000b001', '3030000002', '30303030-0000-0000-0000-000000010001');

insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('30303030-0000-0000-0000-000000020001', '30303030-0000-0000-0000-00000000b001', 901,
   'Ena', 'Grupa', '+38267300001', 'g1@pgtap.invalid', '1990-01-01', '30303030-0000-0000-0000-00000000c002'),
  ('30303030-0000-0000-0000-000000020002', '30303030-0000-0000-0000-00000000b001', 902,
   'Ena', 'Istekla', '+38267300002', 'g2@pgtap.invalid', '1990-01-01', '30303030-0000-0000-0000-00000000c002');

-- An expired G+T with Milena, and an expired one voided as well.
insert into memberships (id, gym_id, member_id, plan_id, trainer_id, start_date, end_date,
                         start_reason, covers_gym, covers_group, covers_personal,
                         group_session_limit, is_backdated, created_by) values
  ('30303030-0000-0000-0000-000000030001', '30303030-0000-0000-0000-00000000b001',
   '30303030-0000-0000-0000-000000020002', '30303030-0000-0000-0000-00000000f003',
   '30303030-0000-0000-0000-00000000d001', '2026-01-01', '2026-02-01', 'fixture',
   true, true, false, 12, true, '30303030-0000-0000-0000-00000000c002');

insert into shifts (id, gym_id, staff_id)
values ('30303030-0000-0000-0000-000000040001', '30303030-0000-0000-0000-00000000b001',
        '30303030-0000-0000-0000-00000000c001');

-- The sale (BR-058a) -----------------------------------------------------------------
set local request.jwt.claims = '{"sub": "30303030-0000-0000-0000-00000000a001"}';
set local role authenticated;

select throws_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash')$$,
  'P0001', 'E_CLASS_TIME_REQUIRED', 'D-71: Grupni without a fixed class time is refused');
select throws_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f003', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', null, null)$$,
  'P0001', 'E_CLASS_TIME_REQUIRED', 'D-71: so is G+T');
select throws_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', null, '19:00')$$,
  'P0001', 'E_CLASS_TIME_INVALID', 'D-71: another trainer''s time is refused');
select throws_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', null, '20:00')$$,
  'P0001', 'E_CLASS_TIME_INVALID', 'BR-025: an inactive slot''s time is refused');
select throws_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d003',
      null, null, 'cash', null, '10:00')$$,
  'P0001', 'E_CLASS_TIME_INVALID',
  'D-71: a trainer with no active time cannot be sold (the slot''s program is inactive)');
select throws_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', null, '08:30')$$,
  'P0001', 'E_CLASS_TIME_INVALID', 'D-71: a time outside the schedule is refused');

-- A statement cannot see rows its own function call inserts, so each sale is checked
-- by the next statement.
select lives_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', null, '08:00')$$,
  'D-71: Grupni is sold with Milena at 08:00');
select is(
  (select class_time from memberships
   where member_id = '30303030-0000-0000-0000-000000020001'
     and plan_id = '30303030-0000-0000-0000-00000000f002'),
  '08:00'::time, 'D-71: the membership keeps the fixed class time');
select lives_ok(
  $$select sell_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f001', null, null, null, 'cash', null, '08:00')$$,
  'D-71: a gym-only plan sells even if a class time is sent');
select is(
  (select class_time from memberships
   where member_id = '30303030-0000-0000-0000-000000020001'
     and plan_id = '30303030-0000-0000-0000-00000000f001'),
  null::time, 'D-71: but keeps no class time');

-- Registration (S-05) carries the same rule.
select throws_ok(
  $$select register_member('3030000001', 'Nova', 'Grupa', '067 303 001', 'n1@pgtap.invalid',
      '1999-09-09', '30303030-0000-0000-0000-00000000f003', '30303030-0000-0000-0000-00000000d002',
      null, null, 'card')$$,
  'P0001', 'E_CLASS_TIME_REQUIRED', 'D-71: a new G+T member needs a fixed class time');
select lives_ok(
  $$select register_member('3030000001', 'Nova', 'Grupa', '067 303 001', 'n1@pgtap.invalid',
      '1999-09-09', '30303030-0000-0000-0000-00000000f003', '30303030-0000-0000-0000-00000000d002',
      null, null, 'card', false, '19:00')$$,
  'D-71: a new G+T member is registered with Tamara''s 19:00');
select is(
  (select ms.class_time from memberships ms join members m on m.id = ms.member_id
   where m.gym_id = '30303030-0000-0000-0000-00000000b001' and m.first_name = 'Nova'),
  '19:00'::time, 'D-71: registration stores the fixed class time');

-- Back-dated entry (S-22) works like S-08; the owner only.
select throws_ok(
  $$select backdated_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', gym_today('30303030-0000-0000-0000-00000000b001') - 1)$$,
  'P0001', 'E_FORBIDDEN', 'BR-120: a receptionist cannot enter a back-dated sale');
reset role;
set local request.jwt.claims = '{"sub": "30303030-0000-0000-0000-00000000a002"}';
set local role authenticated;
select throws_ok(
  $$select backdated_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', gym_today('30303030-0000-0000-0000-00000000b001') - 1)$$,
  'P0001', 'E_CLASS_TIME_REQUIRED', 'D-71: a back-dated Grupni needs a fixed class time too');
select lives_ok(
  $$select backdated_membership('30303030-0000-0000-0000-000000020001',
      '30303030-0000-0000-0000-00000000f002', '30303030-0000-0000-0000-00000000d001',
      null, null, 'cash', gym_today('30303030-0000-0000-0000-00000000b001') - 1,
      null, '18:00')$$,
  'D-71: the owner enters a back-dated Grupni with Milena at 18:00');
select is(
  (select class_time from memberships
   where member_id = '30303030-0000-0000-0000-000000020001'
     and plan_id = '30303030-0000-0000-0000-00000000f002' and is_backdated),
  '18:00'::time, 'D-71: the back-dated sale stores it');

-- The change on S-07 ---------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "30303030-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  (set_membership_class_time(
     (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
        and plan_id = '30303030-0000-0000-0000-00000000f002' and not is_backdated),
     '18:00')).class_time,
  '18:00'::time, 'D-71: a receptionist moves the member to Milena''s 18:00');
select is(
  (select m.class_time from member_memberships('30303030-0000-0000-0000-000000020001') m
   where m.plan_id = '30303030-0000-0000-0000-00000000f002' and not m.is_backdated),
  '18:00'::time, 'S-07: member_memberships returns the fixed class time');
select is(
  (select ms.trainer_id::text || '|' || p.amount::text
   from memberships ms join payments p on p.membership_id = ms.id
   where ms.member_id = '30303030-0000-0000-0000-000000020001'
     and ms.plan_id = '30303030-0000-0000-0000-00000000f002' and not ms.is_backdated),
  '30303030-0000-0000-0000-00000000d001|69.00',
  'D-71: the trainer and the payment stay as sold');
select is(
  (select count(*)::int from payments p join memberships ms on ms.id = p.membership_id
   where ms.member_id = '30303030-0000-0000-0000-000000020001'
     and ms.plan_id = '30303030-0000-0000-0000-00000000f002' and not ms.is_backdated),
  1, 'D-71: the change is not a new sale');

select throws_ok(
  $$select set_membership_class_time(
      (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
         and plan_id = '30303030-0000-0000-0000-00000000f002' and not is_backdated),
      '19:00')$$,
  'P0001', 'E_CLASS_TIME_INVALID', 'D-71: only the membership trainer''s own times');
select throws_ok(
  $$select set_membership_class_time(
      (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
         and plan_id = '30303030-0000-0000-0000-00000000f002' and not is_backdated),
      '20:00')$$,
  'P0001', 'E_CLASS_TIME_INVALID', 'BR-025: not an inactive time');
select throws_ok(
  $$select set_membership_class_time(
      (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
         and plan_id = '30303030-0000-0000-0000-00000000f002' and not is_backdated),
      null)$$,
  'P0001', 'E_CLASS_TIME_REQUIRED', 'D-71: the time cannot be cleared');
select throws_ok(
  $$select set_membership_class_time(
      (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
         and plan_id = '30303030-0000-0000-0000-00000000f001'),
      '08:00')$$,
  'P0001', 'E_VALIDATION', 'D-71: a gym-only membership has no class time to change');
select throws_ok(
  $$select set_membership_class_time('30303030-0000-0000-0000-000000030001', '08:00')$$,
  'P0001', 'E_VALIDATION', 'D-71: nor an expired one');

reset role;
update memberships
set end_date = '2099-12-31', voided_at = now(), void_reason = 'test',
    voided_by = '30303030-0000-0000-0000-00000000c002'
where id = '30303030-0000-0000-0000-000000030001';
set local role authenticated;
select throws_ok(
  $$select set_membership_class_time('30303030-0000-0000-0000-000000030001', '08:00')$$,
  'P0001', 'E_VALIDATION', 'BR-095: nor a voided one');

-- Doc 04 §1: another gym's membership is out of reach.
reset role;
set local request.jwt.claims = '{"sub": "30303030-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select set_membership_class_time(
      (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
         and plan_id = '30303030-0000-0000-0000-00000000f002' and not is_backdated),
      '08:00')$$,
  'P0001', 'E_FORBIDDEN', 'Doc 04 §1: a receptionist of another gym cannot change it');

reset role;
select is(
  (select count(*)::int from audit_log
   where table_name = 'memberships' and action = 'update'
     and gym_id = '30303030-0000-0000-0000-00000000b001'
     and old_data ->> 'class_time' = '08:00:00' and new_data ->> 'class_time' = '18:00:00'),
  1, 'BR-096: the change is in the audit log with the old and new time');

-- S-07: an anonymized member's profile is read-only.
update members set is_anonymized = true where id = '30303030-0000-0000-0000-000000020001';
set local request.jwt.claims = '{"sub": "30303030-0000-0000-0000-00000000a001"}';
set local role authenticated;
select throws_ok(
  $$select set_membership_class_time(
      (select id from memberships where member_id = '30303030-0000-0000-0000-000000020001'
         and plan_id = '30303030-0000-0000-0000-00000000f002' and not is_backdated),
      '08:00')$$,
  'P0001', 'E_FORBIDDEN', 'S-07: not on an anonymized member');
reset role;

-- The table and the privileges ------------------------------------------------------------
select throws_ok(
  $$update memberships set class_time = '08:00'
    where member_id = '30303030-0000-0000-0000-000000020001'
      and plan_id = '30303030-0000-0000-0000-00000000f001'$$,
  '23514', null, 'D-71: the table refuses a class time on a membership without group training');
select ok(class_time_active('30303030-0000-0000-0000-00000000b001',
  '30303030-0000-0000-0000-00000000d001', '18:00'), 'D-71: 18:00 is one of Milena''s times');
select ok(not class_time_active('30303030-0000-0000-0000-00000000b001',
  '30303030-0000-0000-0000-00000000d003', '10:00'), 'BR-025: a slot of an inactive program is not');

select ok(not has_function_privilege('authenticated',
  'class_time_active(uuid, uuid, time)', 'execute'),
  'Doc 08 §4: the helper is internal');
select ok(not has_function_privilege('anon',
  'set_membership_class_time(uuid, time)', 'execute'),
  'Doc 08 §4: anon cannot change a class time');
select ok(has_function_privilege('authenticated',
  'set_membership_class_time(uuid, time)', 'execute'),
  'Doc 08 §4: signed-in staff can call the RPC, which checks the rest');

select * from finish();
