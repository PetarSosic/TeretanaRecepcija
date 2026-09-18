-- M-04: card codes and batches (BR-030 to BR-036).
select plan(12);

insert into auth.users (id, email) values
  ('44444444-0000-0000-0000-00000000a001', null),
  ('44444444-0000-0000-0000-00000000a002', null),
  ('44444444-0000-0000-0000-00000000a003', null);

insert into gyms (id, name, timezone)
values ('44444444-0000-0000-0000-00000000b001', 'pgTAP Kartice', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('44444444-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('44444444-0000-0000-0000-00000000c001', '44444444-0000-0000-0000-00000000b001',
   '44444444-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.kar.vlasnik'),
  ('44444444-0000-0000-0000-00000000c002', '44444444-0000-0000-0000-00000000b001',
   '44444444-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.kar.menadzer'),
  ('44444444-0000-0000-0000-00000000c003', '44444444-0000-0000-0000-00000000b001',
   '44444444-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Recepcija', 'pgtap.kar.recepcija');

-- A batch to hang the constraint checks on, before any role switch.
insert into card_batches (id, gym_id, quantity, created_by)
values ('44444444-0000-0000-0000-00000000d001', '44444444-0000-0000-0000-00000000b001',
        1, '44444444-0000-0000-0000-00000000c001');

-- BR-030: the code shape ---------------------------------------------------------
select matches(
  random_card_code()::text,
  '^[1-9][0-9]{9}$',
  'BR-030: a generated code is ten digits starting 1-9'
);
select is(
  (select count(*)::int from generate_series(1, 500) g
   where random_card_code()::text !~ '^[1-9][0-9]{9}$'),
  0,
  'BR-030: five hundred codes all match the pattern'
);
select throws_ok(
  $$insert into cards (gym_id, code, batch_id)
    values ('44444444-0000-0000-0000-00000000b001', '0123456789',
            '44444444-0000-0000-0000-00000000d001')$$,
  '23514',
  null,
  'BR-030: a code may not start with zero'
);

-- BR-036: the batch ---------------------------------------------------------------
set local request.jwt.claims = '{"sub": "44444444-0000-0000-0000-00000000a001"}';
set local role authenticated;

select lives_ok(
  $$select generate_card_batch(100)$$,
  'BR-036: the owner generates a batch of one hundred'
);
select is(
  (select count(*)::int from cards where gym_id = '44444444-0000-0000-0000-00000000b001'),
  100,
  'BR-036: one hundred cards exist'
);
select is(
  (select count(distinct code)::int from cards
   where gym_id = '44444444-0000-0000-0000-00000000b001'),
  100,
  'BR-030: all one hundred codes are unique'
);
select is(
  (select count(*)::int from cards
   where gym_id = '44444444-0000-0000-0000-00000000b001'
     and (status <> 'unassigned' or member_id is not null)),
  0,
  'BR-031: every new card starts unassigned and holds no member'
);
select throws_ok(
  $$select generate_card_batch(101)$$,
  'P0001',
  'E_VALIDATION',
  'BR-036: more than one hundred is rejected'
);
select throws_ok(
  $$select generate_card_batch(0)$$,
  'P0001',
  'E_VALIDATION',
  'BR-036: zero is rejected'
);

-- Roles (P-64) ---------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "44444444-0000-0000-0000-00000000a002"}';
set local role authenticated;
select lives_ok(
  $$select generate_card_batch(1)$$,
  'P-64: a manager may generate a batch'
);

reset role;
set local request.jwt.claims = '{"sub": "44444444-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select generate_card_batch(1)$$,
  'P0001',
  'E_FORBIDDEN',
  'P-64: a receptionist may not generate a batch'
);
-- Doc 07 §6: a receptionist scans cards but never sees the printing batches.
select is(
  (select count(*)::int from card_batches),
  0,
  'doc 07 §6: a receptionist reads no card batch'
);

reset role;
select * from finish();
