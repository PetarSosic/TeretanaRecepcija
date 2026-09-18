-- M-05: BR-110 to BR-113. One open shift per gym, login resolution and takeover.
select plan(18);

insert into auth.users (id, email) values
  ('55555555-0000-0000-0000-00000000a001', null),
  ('55555555-0000-0000-0000-00000000a002', null),
  ('55555555-0000-0000-0000-00000000a003', null);

insert into gyms (id, name, timezone)
values ('55555555-0000-0000-0000-00000000b001', 'pgTAP Smjene', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('55555555-0000-0000-0000-00000000b001');

insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('55555555-0000-0000-0000-00000000c001', '55555555-0000-0000-0000-00000000b001',
   '55555555-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.ana'),
  ('55555555-0000-0000-0000-00000000c002', '55555555-0000-0000-0000-00000000b001',
   '55555555-0000-0000-0000-00000000a002', 'receptionist', 'pgTAP Bojana', 'pgtap.bojana'),
  ('55555555-0000-0000-0000-00000000c003', '55555555-0000-0000-0000-00000000b001',
   '55555555-0000-0000-0000-00000000a003', 'owner', 'pgTAP Vlasnik', 'pgtap.smj.vlasnik');

-- BR-110: one open shift per gym ------------------------------------------------
insert into shifts (id, gym_id, staff_id)
values ('55555555-0000-0000-0000-00000000d001', '55555555-0000-0000-0000-00000000b001',
        '55555555-0000-0000-0000-00000000c001');
select throws_ok(
  $$insert into shifts (gym_id, staff_id)
    values ('55555555-0000-0000-0000-00000000b001',
            '55555555-0000-0000-0000-00000000c002')$$,
  '23505',
  null,
  'BR-110: a second open shift in the same gym is impossible'
);
select is(
  (open_shift('55555555-0000-0000-0000-00000000b001')).id,
  '55555555-0000-0000-0000-00000000d001'::uuid,
  'BR-110: open_shift returns the one that is open'
);
-- A closed shift never blocks the next one.
update shifts set closed_at = now(), close_type = 'manual',
       closed_by = '55555555-0000-0000-0000-00000000c001'
where id = '55555555-0000-0000-0000-00000000d001';
select lives_ok(
  $$insert into shifts (gym_id, staff_id)
    values ('55555555-0000-0000-0000-00000000b001',
            '55555555-0000-0000-0000-00000000c002')$$,
  'BR-110: once the first is closed, another may open'
);
delete from shifts where gym_id = '55555555-0000-0000-0000-00000000b001';

-- BR-111: login opens, then resumes ---------------------------------------------
set local request.jwt.claims = '{"sub": "55555555-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  resolve_login_shift() ->> 'state',
  'opened',
  'BR-111: with no open shift, login opens one'
);
select is(
  (select count(*)::int from shifts
   where gym_id = '55555555-0000-0000-0000-00000000b001' and closed_at is null),
  1,
  'BR-111: exactly one shift was created'
);
select is(
  (select staff_id from shifts where closed_at is null),
  '55555555-0000-0000-0000-00000000c001'::uuid,
  'US-02.1 AC1: the shift belongs to the receptionist who logged in'
);
select is(
  resolve_login_shift() ->> 'state',
  'resumed',
  'US-02.1 AC2: logging in again resumes the same shift'
);
select is(
  (select count(*)::int from shifts
   where gym_id = '55555555-0000-0000-0000-00000000b001'),
  1,
  'US-02.1 AC2: resuming creates no second shift'
);

-- BR-111: another receptionist meets the gate -----------------------------------
reset role;
set local request.jwt.claims = '{"sub": "55555555-0000-0000-0000-00000000a002"}';
set local role authenticated;

select is(
  resolve_login_shift() ->> 'state',
  'gate',
  'BR-111: someone else''s open shift sends the receptionist to S-02'
);

-- E19: the takeover ---------------------------------------------------------------
select is(
  take_over_shift(120.50) ->> 'state',
  'taken_over',
  'E19: [Preuzmi smjenu] takes the shift over'
);
select is(
  (select count(*)::int from shifts
   where gym_id = '55555555-0000-0000-0000-00000000b001' and closed_at is null),
  1,
  'BR-110: still exactly one open shift afterwards'
);
select is(
  (select staff_id from shifts where closed_at is null),
  '55555555-0000-0000-0000-00000000c002'::uuid,
  'E19: the new open shift belongs to the receptionist who took over'
);
-- Doc 07 §6 hides another receptionist's closed shift from Bojana, and these three
-- assertions are about what was written rather than who may read it.
reset role;
select is(
  (select close_type from shifts
   where staff_id = '55555555-0000-0000-0000-00000000c001' and closed_at is not null),
  'takeover'::shift_close_type,
  'E19: the previous shift is closed as a takeover'
);
select is(
  (select counted_cash from shifts
   where staff_id = '55555555-0000-0000-0000-00000000c001' and closed_at is not null),
  120.50::numeric,
  'AS-10: the counted cash entered at takeover is stored on the closed shift'
);
select is(
  (select email_status from shifts
   where staff_id = '55555555-0000-0000-0000-00000000c001' and closed_at is not null),
  'not_sent'::email_status,
  'BR-117: the closed shift still owes its report, which M-10 sends'
);

-- BR-112: owners and managers have no shifts -------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "55555555-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  resolve_login_shift() ->> 'state',
  'none',
  'BR-112: an owner login neither opens nor resumes a shift'
);
select throws_ok(
  $$select take_over_shift(null)$$,
  'P0001',
  'E_FORBIDDEN',
  'BR-110: only a receptionist may take a shift over'
);
select is(
  (select count(*)::int from shifts
   where gym_id = '55555555-0000-0000-0000-00000000b001' and closed_at is null),
  1,
  'BR-112: the owner''s login changed nothing'
);

reset role;
select * from finish();
