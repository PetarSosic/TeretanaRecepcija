-- D-89: session_context() gives the caller's staff row, gym name, gym_today() and open
-- shift in one call, and null to anyone who is not active staff (doc 04 §2 point 5).
select plan(14);

insert into auth.users (id, email) values
  ('89898989-0000-0000-0000-00000000a001', null),
  ('89898989-0000-0000-0000-00000000a002', null),
  ('89898989-0000-0000-0000-00000000a003', null),
  ('89898989-0000-0000-0000-00000000a004', null);

insert into gyms (id, name, timezone)
values ('89898989-0000-0000-0000-00000000b001', 'pgTAP Sesija', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('89898989-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, username, is_active) values
  ('89898989-0000-0000-0000-00000000c001', '89898989-0000-0000-0000-00000000b001',
   '89898989-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Sesija Ana',
   'pgtap.ses.ana', true),
  ('89898989-0000-0000-0000-00000000c002', '89898989-0000-0000-0000-00000000b001',
   '89898989-0000-0000-0000-00000000a002', 'owner', 'pgTAP Sesija Vlasnik',
   'pgtap.ses.vlasnik', true),
  ('89898989-0000-0000-0000-00000000c003', '89898989-0000-0000-0000-00000000b001',
   '89898989-0000-0000-0000-00000000a003', 'manager', 'pgTAP Sesija Bivši',
   'pgtap.ses.bivsi', false);
-- a004 is an Auth user with no staff row.

set local role authenticated;

-- The owner, no shift open yet -------------------------------------------------------
set local request.jwt.claims = '{"sub": "89898989-0000-0000-0000-00000000a002"}';
select is(
  session_context() -> 'staff' ->> 'id',
  '89898989-0000-0000-0000-00000000c002',
  'D-89: the caller''s own staff row'
);
select is(
  session_context() -> 'staff' ->> 'role',
  'owner',
  'D-89: with its role'
);
select is(
  session_context() ->> 'gym_name',
  'pgTAP Sesija',
  'D-89: the gym''s name'
);
select is(
  (session_context() ->> 'today')::date,
  gym_today('89898989-0000-0000-0000-00000000b001'),
  'D-89 and BR-001: today is gym_today() of the caller''s gym'
);
select is(
  json_typeof(session_context() -> 'open_shift'),
  'null',
  'D-89: no open shift yet'
);

-- Ana's shift is open ------------------------------------------------------------------
reset role;
insert into shifts (id, gym_id, staff_id)
values ('89898989-0000-0000-0000-00000000d001', '89898989-0000-0000-0000-00000000b001',
        '89898989-0000-0000-0000-00000000c001');
set local role authenticated;

select is(
  session_context() -> 'open_shift' ->> 'id',
  '89898989-0000-0000-0000-00000000d001',
  'BR-110: the gym''s open shift'
);
select is(
  session_context() -> 'open_shift' ->> 'staff_name',
  'pgTAP Sesija Ana',
  'BR-110: named after the receptionist who holds it'
);
select is(
  (session_context() -> 'open_shift' ->> 'is_mine')::boolean,
  false,
  'BR-111: not the owner''s own shift'
);
select is(
  (session_context() -> 'open_shift')::jsonb,
  open_shift_info()::jsonb,
  'D-89: the same shift open_shift_info() gives'
);

set local request.jwt.claims = '{"sub": "89898989-0000-0000-0000-00000000a001"}';
select is(
  (session_context() -> 'open_shift' ->> 'is_mine')::boolean,
  true,
  'BR-111: the receptionist''s own shift'
);

-- Nobody else gets a session ---------------------------------------------------------
set local request.jwt.claims = '{"sub": "89898989-0000-0000-0000-00000000a003"}';
select ok(session_context() is null, 'Doc 04 §2: a deactivated account gets no session');

set local request.jwt.claims = '{"sub": "89898989-0000-0000-0000-00000000a004"}';
select ok(session_context() is null, 'D-89: an Auth user with no staff row gets no session');

set local request.jwt.claims = '{}';
select ok(session_context() is null, 'D-89: no user, no session');

reset role;
select ok(
  not has_function_privilege('anon', 'session_context()', 'execute'),
  'D-89: the anonymous role may not call session_context()'
);

select * from finish();
