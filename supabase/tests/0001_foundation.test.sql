-- M-01: helper functions (doc 07 §4), RLS SELECT policies (doc 07 §6), the
-- write lockout of doc 04 §2 and the BR-096 audit trigger.
-- The runner wraps this file in a transaction and always rolls it back, so the
-- fixtures below never reach the real gym data (D-56).
select plan(22);

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-00000000a001', 'pgtap.owner@example.com'),
  ('11111111-0000-0000-0000-00000000a002', 'pgtap.manager@example.com'),
  ('11111111-0000-0000-0000-00000000a003', null),
  ('11111111-0000-0000-0000-00000000a004', null),
  ('11111111-0000-0000-0000-00000000a005', null);

insert into gyms (id, name, timezone)
values ('11111111-0000-0000-0000-00000000b001', 'pgTAP Teretana', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('11111111-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, email, username) values
  ('11111111-0000-0000-0000-00000000c001', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.owner@example.com', null),
  ('11111111-0000-0000-0000-00000000c002', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.manager@example.com', null),
  ('11111111-0000-0000-0000-00000000c003', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Recepcija Jedan', null, 'pgtap.jedan'),
  ('11111111-0000-0000-0000-00000000c004', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Recepcija Dva', null, 'pgtap.dva'),
  ('11111111-0000-0000-0000-00000000c005', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000a005', 'receptionist', 'pgTAP Neaktivna', null, 'pgtap.tri');
update staff set is_active = false where id = '11111111-0000-0000-0000-00000000c005';

-- One open shift (BR-110) plus one closed shift per receptionist.
insert into shifts (id, gym_id, staff_id) values
  ('11111111-0000-0000-0000-00000000d001', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000c003');
insert into shifts (id, gym_id, staff_id, closed_at, close_type, closed_by) values
  ('11111111-0000-0000-0000-00000000d002', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000c003', now() - interval '1 day', 'manual',
   '11111111-0000-0000-0000-00000000c003'),
  ('11111111-0000-0000-0000-00000000d003', '11111111-0000-0000-0000-00000000b001',
   '11111111-0000-0000-0000-00000000c004', now() - interval '2 days', 'manual',
   '11111111-0000-0000-0000-00000000c004');

-- Helper functions (doc 07 §4) -------------------------------------------------
-- BR-001: the gym's local date, never the server date (the server runs in UTC).
select is(
  gym_today('11111111-0000-0000-0000-00000000b001'),
  (now() at time zone 'Europe/Podgorica')::date,
  'BR-001: gym_today returns the Podgorica date'
);
select is(
  gym_local_date('11111111-0000-0000-0000-00000000b001', timestamptz '2026-01-01 23:30:00+00'),
  date '2026-01-02',
  'BR-001: 23:30 UTC in winter is already the next Podgorica day'
);
select is(
  gym_local_date('11111111-0000-0000-0000-00000000b001', timestamptz '2026-01-02 00:30:00+00'),
  date '2026-01-02',
  'BR-001: 00:30 UTC in winter is the same Podgorica day'
);
select is(
  gym_local_date('11111111-0000-0000-0000-00000000b001', timestamptz '2026-06-30 22:30:00+00'),
  date '2026-07-01',
  'BR-001: summer time shifts the day boundary to 22:00 UTC'
);
select is(
  (open_shift('11111111-0000-0000-0000-00000000b001')).id,
  '11111111-0000-0000-0000-00000000d001'::uuid,
  'BR-110: open_shift returns the gym''s single open shift'
);

-- BR-096 audit trigger ---------------------------------------------------------
select is(
  (select count(*)::int from audit_log
   where gym_id = '11111111-0000-0000-0000-00000000b001'
     and table_name = 'staff' and action = 'insert'),
  5,
  'BR-096: every staff insert is audited'
);
update gym_settings set personal_min_price = 85
where gym_id = '11111111-0000-0000-0000-00000000b001';
select is(
  (select new_data ->> 'personal_min_price' from audit_log
   where table_name = 'gym_settings' and action = 'update'
     and gym_id = '11111111-0000-0000-0000-00000000b001'),
  '85.00',
  'BR-096: a settings change is audited with the new value'
);
select is(
  (select old_data ->> 'personal_min_price' from audit_log
   where table_name = 'gym_settings' and action = 'update'
     and gym_id = '11111111-0000-0000-0000-00000000b001'),
  '80.00',
  'BR-096: the audit row keeps the old value'
);

-- RLS: receptionist (doc 07 §6) ------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-0000-0000-0000-00000000a004"}';
set local role authenticated;

select is(my_role(), 'receptionist'::app_role, 'current_staff resolves the signed-in receptionist');
select is(
  (select count(*)::int from staff),
  1,
  'doc 07 §6: a receptionist sees only their own staff row'
);
select is(
  (select id from staff),
  '11111111-0000-0000-0000-00000000c004'::uuid,
  'doc 07 §6: and that row is their own'
);
select is(
  (select count(*)::int from shifts),
  2,
  'doc 07 §6: a receptionist sees the open shift and their own shifts'
);
select is(
  (select count(*)::int from shifts where id = '11111111-0000-0000-0000-00000000d002'),
  0,
  'doc 07 §6: another receptionist''s closed shift stays hidden'
);
select is(
  (select count(*)::int from audit_log),
  0,
  'doc 07 §6: the audit log is owner-only'
);
-- Doc 04 §2: authenticated has no direct writes; every write goes through an RPC.
select throws_ok(
  $$insert into staff (gym_id, user_id, role, full_name, username)
    values ('11111111-0000-0000-0000-00000000b001', '11111111-0000-0000-0000-00000000a005',
            'receptionist', 'Ubaceni Nalog', 'pgtap.cetiri')$$,
  '42501',
  null,
  'doc 04 §2: authenticated cannot insert staff'
);
select throws_ok(
  $$update gyms set name = 'Preimenovana'$$,
  '42501',
  null,
  'doc 04 §2: authenticated cannot update gyms'
);
select throws_ok(
  $$select count(*) from member_counters$$,
  '42501',
  null,
  'doc 07 §6: member_counters is not readable by any staff role'
);

-- RLS: manager -----------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "11111111-0000-0000-0000-00000000a002"}';
set local role authenticated;

select is(
  (select count(*)::int from staff),
  5,
  'doc 07 §6: a manager sees the gym''s staff'
);
select is(
  (select count(*)::int from shifts),
  1,
  'doc 07 §6: a manager sees the open shift only'
);

-- RLS: owner -------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "11111111-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  (select count(*)::int from shifts),
  3,
  'doc 07 §6: an owner sees every shift of the gym'
);
select ok(
  (select count(*) from audit_log
   where gym_id = '11111111-0000-0000-0000-00000000b001') > 0,
  'doc 07 §6: an owner reads the audit log'
);

-- A signed-in user without an active staff row is not staff (doc 08 §5) ---------
reset role;
set local request.jwt.claims = '{"sub": "11111111-0000-0000-0000-00000000a005"}';
set local role authenticated;
select throws_ok(
  $$select current_staff()$$,
  'P0001',
  'E_NOT_STAFF',
  'doc 08 §5: a deactivated account raises E_NOT_STAFF'
);

reset role;
select * from finish();
