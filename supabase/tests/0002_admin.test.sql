-- M-02b: the admin role (D-58), the identity rule (D-57) and the admin-only password
-- store (D-59). Rolled back by the runner like every other test file.
select plan(12);

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000a001', 'pgtap.admin@example.com'),
  ('22222222-0000-0000-0000-00000000a002', null),
  ('22222222-0000-0000-0000-00000000a003', null),
  ('22222222-0000-0000-0000-00000000a004', null),
  ('22222222-0000-0000-0000-00000000a005', null);

insert into gyms (id, name, timezone)
values ('22222222-0000-0000-0000-00000000b001', 'pgTAP Admin Teretana', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('22222222-0000-0000-0000-00000000b001');

-- D-57: every account but the admin signs in with a username.
insert into staff (id, gym_id, user_id, role, full_name, email, username) values
  ('22222222-0000-0000-0000-00000000c001', '22222222-0000-0000-0000-00000000b001',
   '22222222-0000-0000-0000-00000000a001', 'admin', 'pgTAP Administrator',
   'pgtap.admin@example.com', null),
  ('22222222-0000-0000-0000-00000000c002', '22222222-0000-0000-0000-00000000b001',
   '22222222-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', null, 'pgtap.vlasnik'),
  ('22222222-0000-0000-0000-00000000c003', '22222222-0000-0000-0000-00000000b001',
   '22222222-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', null, 'pgtap.menadzer'),
  ('22222222-0000-0000-0000-00000000c004', '22222222-0000-0000-0000-00000000b001',
   '22222222-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Recepcija', null, 'pgtap.recepcija');

insert into staff_credentials (staff_id, gym_id, password) values
  ('22222222-0000-0000-0000-00000000c002', '22222222-0000-0000-0000-00000000b001', 'tajna-vlasnika'),
  ('22222222-0000-0000-0000-00000000c003', '22222222-0000-0000-0000-00000000b001', 'tajna-menadzera');

-- D-57: the identity rule ------------------------------------------------------
select throws_ok(
  $$insert into staff (gym_id, user_id, role, full_name, username, email)
    values ('22222222-0000-0000-0000-00000000b001', gen_random_uuid(), 'manager',
            'Dva Identiteta', 'pgtap.dva', 'dva@example.com')$$,
  '23514',
  null,
  'D-57: an account cannot have both a username and an email'
);
select throws_ok(
  $$insert into staff (gym_id, user_id, role, full_name)
    values ('22222222-0000-0000-0000-00000000b001', gen_random_uuid(), 'manager',
            'Bez Identiteta')$$,
  '23514',
  null,
  'D-57: an account must have one of the two'
);
select throws_ok(
  $$insert into staff (gym_id, user_id, role, full_name, username)
    values ('22222222-0000-0000-0000-00000000b001', gen_random_uuid(), 'admin',
            'Admin Bez Mejla', 'pgtap.admin2')$$,
  '23514',
  null,
  'D-57: an admin must have an email so the password can be reset'
);
select lives_ok(
  $$insert into staff (gym_id, user_id, role, full_name, username)
    values ('22222222-0000-0000-0000-00000000b001', '22222222-0000-0000-0000-00000000a005',
            'owner', 'Vlasnik Sa Imenom', 'pgtap.vlasnik2')$$,
  'D-57: an owner may sign in with a username'
);

-- D-59: only the admin reads stored passwords ----------------------------------
set local request.jwt.claims = '{"sub": "22222222-0000-0000-0000-00000000a001"}';
set local role authenticated;
select is(my_role(), 'admin'::app_role, 'D-58: the admin role resolves');
select is(
  (select count(*)::int from staff_credentials),
  2,
  'D-59: the admin reads every stored password of the gym'
);
select is(
  (select password from staff_credentials
   where staff_id = '22222222-0000-0000-0000-00000000c002'),
  'tajna-vlasnika',
  'D-59: and reads the value itself'
);
select is(
  (select count(*)::int from shifts),
  0,
  'D-58: the admin reads shifts on the same terms as an owner (none exist here)'
);

reset role;
set local request.jwt.claims = '{"sub": "22222222-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (select count(*)::int from staff_credentials),
  0,
  'D-59: an owner reads no stored password, not even their own'
);

reset role;
set local request.jwt.claims = '{"sub": "22222222-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  (select count(*)::int from staff_credentials),
  0,
  'D-59: a manager reads no stored password'
);

reset role;
set local request.jwt.claims = '{"sub": "22222222-0000-0000-0000-00000000a004"}';
set local role authenticated;
select is(
  (select count(*)::int from staff_credentials),
  0,
  'D-59: a receptionist reads no stored password'
);
-- Doc 04 §2: writes still go nowhere directly.
select throws_ok(
  $$update staff_credentials set password = 'ukradena'$$,
  '42501',
  null,
  'doc 04 §2: authenticated cannot write stored passwords'
);

reset role;
select * from finish();
