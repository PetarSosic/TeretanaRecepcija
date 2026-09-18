-- M-03: the catalogue rules — BR-024 (a slot's trainer must be on the program),
-- BR-004 (a price change never rewrites an existing record), BR-026 and BR-131,
-- plus the doc 07 §6 visibility of the owner-only finance tables.
select plan(22);

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('33333333-0000-0000-0000-00000000a001', null),
  ('33333333-0000-0000-0000-00000000a002', null),
  ('33333333-0000-0000-0000-00000000a003', null);

insert into gyms (id, name, timezone)
values ('33333333-0000-0000-0000-00000000b001', 'pgTAP Katalog', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('33333333-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('33333333-0000-0000-0000-00000000c001', '33333333-0000-0000-0000-00000000b001',
   '33333333-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.kat.vlasnik'),
  ('33333333-0000-0000-0000-00000000c002', '33333333-0000-0000-0000-00000000b001',
   '33333333-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.kat.menadzer'),
  ('33333333-0000-0000-0000-00000000c003', '33333333-0000-0000-0000-00000000b001',
   '33333333-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Recepcija', 'pgtap.kat.recepcija');

insert into trainers (id, gym_id, full_name) values
  ('33333333-0000-0000-0000-00000000d001', '33333333-0000-0000-0000-00000000b001', 'pgTAP Dodijeljena'),
  ('33333333-0000-0000-0000-00000000d002', '33333333-0000-0000-0000-00000000b001', 'pgTAP Nedodijeljena');
insert into trainer_finance (trainer_id, gym_id, personal_gym_fee) values
  ('33333333-0000-0000-0000-00000000d001', '33333333-0000-0000-0000-00000000b001', 80),
  ('33333333-0000-0000-0000-00000000d002', '33333333-0000-0000-0000-00000000b001', null);

insert into programs (id, gym_id, name, kind)
values ('33333333-0000-0000-0000-00000000e001', '33333333-0000-0000-0000-00000000b001',
        'pgTAP Grupni', 'group');
insert into trainer_programs (gym_id, trainer_id, program_id)
values ('33333333-0000-0000-0000-00000000b001', '33333333-0000-0000-0000-00000000d001',
        '33333333-0000-0000-0000-00000000e001');

insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price, covers_gym)
values ('33333333-0000-0000-0000-00000000f001', '33333333-0000-0000-0000-00000000b001',
        'pgTAP Mjesečna', 'gym', 1, 'month', 79, true);
insert into plan_finance (plan_id, gym_id) values
  ('33333333-0000-0000-0000-00000000f001', '33333333-0000-0000-0000-00000000b001');

insert into expense_categories (id, gym_id, name, is_system) values
  ('33333333-0000-0000-0000-000000010001', '33333333-0000-0000-0000-00000000b001',
   'pgTAP Roba za prodaju', true);
insert into expense_categories (id, gym_id, name, is_salary) values
  ('33333333-0000-0000-0000-000000010002', '33333333-0000-0000-0000-00000000b001',
   'pgTAP Plate', true);

-- D-62: a group plan whose percentage a trainer can override.
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_group, requires_trainer)
values ('33333333-0000-0000-0000-00000000f002', '33333333-0000-0000-0000-00000000b001',
        'pgTAP Grupni plan', 'group', 1, 'month', 69, true, true);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct)
values ('33333333-0000-0000-0000-00000000f002', '33333333-0000-0000-0000-00000000b001', 0, 70);

-- BR-024: a slot's trainer must be assigned to that slot's program -------------
select lives_ok(
  $$insert into class_slots (gym_id, program_id, trainer_id, weekday, starts_at)
    values ('33333333-0000-0000-0000-00000000b001', '33333333-0000-0000-0000-00000000e001',
            '33333333-0000-0000-0000-00000000d001', 2, time '08:00')$$,
  'BR-024: a slot with an assigned trainer is accepted'
);
select throws_ok(
  $$insert into class_slots (gym_id, program_id, trainer_id, weekday, starts_at)
    values ('33333333-0000-0000-0000-00000000b001', '33333333-0000-0000-0000-00000000e001',
            '33333333-0000-0000-0000-00000000d002', 2, time '09:00')$$,
  'P0001',
  'E_TRAINER_NOT_ASSIGNED',
  'BR-024: a slot with an unassigned trainer is rejected'
);

-- BR-131: a system category can never be deactivated --------------------------
select throws_ok(
  $$update expense_categories set is_active = false
    where id = '33333333-0000-0000-0000-000000010001'$$,
  '23514',
  null,
  'BR-131: a system category cannot be deactivated'
);

-- Doc 07 §3: the plan check constraints ---------------------------------------
select throws_ok(
  $$insert into plans (gym_id, name, kind, duration_value, duration_unit, price)
    values ('33333333-0000-0000-0000-00000000b001', 'pgTAP Loša dnevna', 'day_pass', 1, 'month', 10)$$,
  '23514',
  null,
  'doc 07 §3: a day pass has no duration'
);
select throws_ok(
  $$insert into plans (gym_id, name, kind, duration_value, duration_unit, price)
    values ('33333333-0000-0000-0000-00000000b001', 'pgTAP Loš personalni', 'personal', 1, 'month', 50)$$,
  '23514',
  null,
  'doc 07 §3: a personal plan carries no price'
);

-- Owner: the RPCs, and BR-004 ---------------------------------------------------
set local request.jwt.claims = '{"sub": "33333333-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  (select count(*)::int from trainer_finance),
  2,
  'doc 07 §6: the owner reads trainer fees'
);
select is(
  (select count(*)::int from plan_finance),
  2,
  'doc 07 §6: the owner reads plan finance'
);

-- BR-004: raising the price leaves the stored plan row's history alone. The
-- membership tables arrive in M-06, so this checks the closest thing that exists:
-- the audit row keeps the old price, and the new price is what the plan now carries.
select lives_ok(
  $$select upsert_plan(
      '33333333-0000-0000-0000-00000000f001', 'pgTAP Mjesečna', 'gym'::plan_kind,
      1::smallint, 'month'::duration_unit, 89::numeric,
      true, false, false, null::smallint, null::smallint, false, 0::smallint, true,
      0::numeric, null::numeric)$$,
  'BR-004: the owner may change a plan price'
);
select is(
  (select price from plans where id = '33333333-0000-0000-0000-00000000f001'),
  89::numeric,
  'BR-004: the plan now carries the new price'
);
select is(
  (select old_data ->> 'price' from audit_log
   where table_name = 'plans' and action = 'update'
     and row_id = '33333333-0000-0000-0000-00000000f001'),
  '79.00',
  'BR-096: the audit row keeps the price that was replaced'
);

select throws_ok(
  $$select upsert_class_slot(null, '33333333-0000-0000-0000-00000000e001',
      '33333333-0000-0000-0000-00000000d002', 3::smallint, time '10:00', true)$$,
  'P0001',
  'E_TRAINER_NOT_ASSIGNED',
  'BR-024: the RPC rejects an unassigned trainer too'
);

-- Manager: the schedule yes, the money no (BR-026, P-61) ------------------------
reset role;
set local request.jwt.claims = '{"sub": "33333333-0000-0000-0000-00000000a002"}';
set local role authenticated;

select is(
  (select count(*)::int from trainer_finance),
  0,
  'BR-026: a manager reads no trainer fee'
);
select is(
  (select count(*)::int from plan_finance),
  0,
  'doc 07 §6: a manager reads no plan finance'
);
select lives_ok(
  $$select upsert_trainer(null, 'pgTAP Novi trener', true)$$,
  'P-60: a manager may add a trainer'
);
select throws_ok(
  $$select set_trainer_fee('33333333-0000-0000-0000-00000000d001', 90::numeric, null::numeric)$$,
  'P0001',
  'E_FORBIDDEN',
  'BR-026: a manager cannot set a trainer fee'
);
select throws_ok(
  $$select upsert_product(null, 'pgTAP Voda', 0.30::numeric, 1.50::numeric, true)$$,
  'P0001',
  'E_FORBIDDEN',
  'BR-140: a manager cannot add a product'
);

-- D-62: the trainer group share overrides the plan percentage ------------------
reset role;
set local request.jwt.claims = '{"sub": "33333333-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  resolve_group_share('33333333-0000-0000-0000-00000000d001', '33333333-0000-0000-0000-00000000f002'),
  70::numeric,
  'D-62: with no trainer share, the plan percentage applies'
);
select lives_ok(
  $$select set_trainer_fee('33333333-0000-0000-0000-00000000d001', 80::numeric, 60::numeric)$$,
  'D-62: the owner sets a trainer group share'
);
select is(
  resolve_group_share('33333333-0000-0000-0000-00000000d001', '33333333-0000-0000-0000-00000000f002'),
  60::numeric,
  'D-62: the trainer share overrides the plan percentage'
);
select lives_ok(
  $$select set_trainer_fee('33333333-0000-0000-0000-00000000d001', 80::numeric, null::numeric)$$,
  'D-62: clearing it is allowed'
);
select is(
  resolve_group_share('33333333-0000-0000-0000-00000000d001', '33333333-0000-0000-0000-00000000f002'),
  70::numeric,
  'D-62: cleared means the plan percentage again'
);

-- Receptionist: no settings at all (P-60 to P-63) ------------------------------
reset role;
set local request.jwt.claims = '{"sub": "33333333-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select upsert_trainer(null, 'pgTAP Zabranjeni', true)$$,
  'P0001',
  'E_FORBIDDEN',
  'P-60: a receptionist cannot manage trainers'
);

reset role;
select * from finish();
