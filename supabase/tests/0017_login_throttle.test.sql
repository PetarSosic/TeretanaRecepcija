-- D-75: 5 failed sign-ins in a row lock a login for 15 minutes, 30 failures in 15 minutes
-- lock a client address (US-01.1 AC6, AC7), and the owner or the admin unlocks on S-23
-- (P-08).
select plan(37);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('75757575-0000-0000-0000-00000000a001', 'pgtap.lt.admin@example.com'),
  ('75757575-0000-0000-0000-00000000a002', 'pgtap.lt.vlasnik@staff.pgtap.invalid'),
  ('75757575-0000-0000-0000-00000000a003', 'pgtap.lt.menadzer@staff.pgtap.invalid'),
  ('75757575-0000-0000-0000-00000000a004', 'pgtap.lt.ana@staff.pgtap.invalid'),
  ('75757575-0000-0000-0000-00000000a005', 'pgtap.lt.vlasnik2@staff.pgtap.invalid'),
  ('75757575-0000-0000-0000-00000000a006', 'pgtap.lt.drugi@staff.pgtap.invalid');
insert into gyms (id, name, timezone) values
  ('75757575-0000-0000-0000-00000000b001', 'pgTAP Prijava', 'Europe/Podgorica'),
  ('75757575-0000-0000-0000-00000000b002', 'pgTAP Druga', 'Europe/Podgorica');
insert into gym_settings (gym_id) values
  ('75757575-0000-0000-0000-00000000b001'),
  ('75757575-0000-0000-0000-00000000b002');
insert into staff (id, gym_id, user_id, role, full_name, email, username) values
  ('75757575-0000-0000-0000-00000000c001', '75757575-0000-0000-0000-00000000b001',
   '75757575-0000-0000-0000-00000000a001', 'admin', 'pgTAP Administrator',
   'pgtap.lt.admin@example.com', null),
  ('75757575-0000-0000-0000-00000000c002', '75757575-0000-0000-0000-00000000b001',
   '75757575-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', null, 'pgtap.lt.vlasnik'),
  ('75757575-0000-0000-0000-00000000c003', '75757575-0000-0000-0000-00000000b001',
   '75757575-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadžer', null, 'pgtap.lt.menadzer'),
  ('75757575-0000-0000-0000-00000000c004', '75757575-0000-0000-0000-00000000b001',
   '75757575-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Ana', null, 'pgtap.lt.ana'),
  ('75757575-0000-0000-0000-00000000c005', '75757575-0000-0000-0000-00000000b001',
   '75757575-0000-0000-0000-00000000a005', 'owner', 'pgTAP Vlasnik Dva', null, 'pgtap.lt.vlasnik2'),
  ('75757575-0000-0000-0000-00000000c006', '75757575-0000-0000-0000-00000000b002',
   '75757575-0000-0000-0000-00000000a006', 'owner', 'pgTAP Drugi', null, 'pgtap.lt.drugi');

-- Privileges ------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'login_attempt_begin(text, text)', 'execute')
          and not has_function_privilege('authenticated', 'login_attempt_begin(text, text)', 'execute')
          and not has_function_privilege('authenticated',
                'login_attempt_end(text, text, boolean)', 'execute'),
  'D-75: the counters are the server''s alone, never a signed-in or anonymous caller''s');
select ok(has_function_privilege('service_role', 'login_attempt_begin(text, text)', 'execute')
          and has_function_privilege('service_role',
                'login_attempt_end(text, text, boolean)', 'execute'),
  'D-75: the sign-in action calls them with the service role');
select ok(not has_function_privilege('anon', 'unlock_staff_login(uuid)', 'execute')
          and not has_function_privilege('anon', 'staff_login_locks()', 'execute'),
  'P-08: nobody signed out may list or lift locks');
select ok(not has_schema_privilege('authenticated', 'private', 'usage')
          and not has_schema_privilege('anon', 'private', 'usage'),
  'D-75: the private schema is out of the Data API''s reach');
select ok(not exists (select 1 from backup_tables() where table_name = 'login_throttle'),
  'BR-163: the counters are not part of the weekly backup');

-- US-01.1 AC6: five failures in a row lock the login ----------------------------------
do $$
begin
  for i in 1..4 loop
    perform login_attempt_begin('pgtap.lt.ana@staff.pgtap.invalid', null);
    perform login_attempt_end('pgtap.lt.ana@staff.pgtap.invalid', null, false);
  end loop;
end $$;
select is(login_attempt_begin('pgtap.lt.ana@staff.pgtap.invalid', null) ->> 'allowed', 'true',
  'US-01.1 AC6: the fifth attempt is still tried');
select login_attempt_end('pgtap.lt.ana@staff.pgtap.invalid', null, false);
select is(
  (select locked_until from private.login_throttle
   where key = 'login:pgtap.lt.ana@staff.pgtap.invalid'),
  now() + interval '15 minutes', 'US-01.1 AC6: its failure locks the login for 15 minutes');
select is(login_attempt_begin('pgtap.lt.ana@staff.pgtap.invalid', null)::jsonb,
  '{"allowed": false, "minutes": 15}'::jsonb,
  'US-01.1 AC6: the next attempt is refused before any password is checked');
select is(login_attempt_begin('  PGTAP.LT.Ana@staff.pgtap.invalid ', null) ->> 'allowed', 'false',
  'US-01.1 AC6: whatever the case and spacing of the input');
select is(
  (select count(*)::int from audit_log
   where gym_id = '75757575-0000-0000-0000-00000000b001'
     and row_id = '75757575-0000-0000-0000-00000000c004'
     and new_data ->> 'login_locked_until' is not null and changed_by is null),
  1, 'BR-096: the lock of a staff login is in Dnevnik izmjena, by nobody');

-- A login that belongs to nobody is counted and locked just the same (US-01.1 AC3).
do $$
begin
  for i in 1..5 loop
    perform login_attempt_begin('ne.postoji@staff.pgtap.invalid', null);
    perform login_attempt_end('ne.postoji@staff.pgtap.invalid', null, false);
  end loop;
end $$;
select is(login_attempt_begin('ne.postoji@staff.pgtap.invalid', null) ->> 'allowed', 'false',
  'US-01.1 AC3: an unknown login is locked too, so a lock reveals no account');

-- Five attempts still under way refuse a sixth, so a burst cannot slip past.
do $$
begin
  for i in 1..5 loop
    perform login_attempt_begin('burst@staff.pgtap.invalid', null);
  end loop;
end $$;
select is(login_attempt_begin('burst@staff.pgtap.invalid', null) ->> 'allowed', 'false',
  'D-75: a sixth parallel attempt is refused while five are under way');

-- A success clears the login's counter.
do $$
begin
  for i in 1..4 loop
    perform login_attempt_begin('uspjeh@staff.pgtap.invalid', null);
    perform login_attempt_end('uspjeh@staff.pgtap.invalid', null, false);
  end loop;
  perform login_attempt_begin('uspjeh@staff.pgtap.invalid', null);
  perform login_attempt_end('uspjeh@staff.pgtap.invalid', null, true);
end $$;
select ok(not exists (select 1 from private.login_throttle
                      where key = 'login:uspjeh@staff.pgtap.invalid'),
  'US-01.1 AC6: a successful sign-in clears the failures ("in a row")');

-- A window lasts 15 minutes, and a lock that ran out starts a new one.
do $$
begin
  for i in 1..4 loop
    perform login_attempt_begin('prozor@staff.pgtap.invalid', null);
    perform login_attempt_end('prozor@staff.pgtap.invalid', null, false);
  end loop;
end $$;
update private.login_throttle set window_start = now() - interval '16 minutes'
where key = 'login:prozor@staff.pgtap.invalid';
select is(login_attempt_begin('prozor@staff.pgtap.invalid', null) ->> 'allowed', 'true',
  'D-75: failures older than 15 minutes no longer count');
select is((select attempts::int from private.login_throttle
           where key = 'login:prozor@staff.pgtap.invalid'), 1,
  'D-75: and the count starts again');

do $$
begin
  for i in 1..5 loop
    perform login_attempt_begin('isteklo@staff.pgtap.invalid', null);
    perform login_attempt_end('isteklo@staff.pgtap.invalid', null, false);
  end loop;
end $$;
update private.login_throttle set locked_until = now() - interval '1 second'
where key = 'login:isteklo@staff.pgtap.invalid';
select is(login_attempt_begin('isteklo@staff.pgtap.invalid', null) ->> 'allowed', 'true',
  'US-01.1 AC6: after 15 minutes the login may try again');
select is(
  (select attempts::text || '|' || coalesce(locked_until::text, 'open') from private.login_throttle
   where key = 'login:isteklo@staff.pgtap.invalid'),
  '1|open', 'D-75: with a fresh count of five');

-- US-01.1 AC7: thirty failures from one address lock the address ---------------------
do $$
begin
  for i in 1..30 loop
    perform login_attempt_begin('ip' || i || '@staff.pgtap.invalid', '203.0.113.7');
    perform login_attempt_end('ip' || i || '@staff.pgtap.invalid', '203.0.113.7', false);
  end loop;
end $$;
select is(login_attempt_begin('novo@staff.pgtap.invalid', '203.0.113.7')::jsonb,
  '{"allowed": false, "minutes": 15}'::jsonb,
  'US-01.1 AC7: after 30 failures from one address, every login from it waits 15 minutes');
select is(login_attempt_begin('novo@staff.pgtap.invalid', '198.51.100.9') ->> 'allowed', 'true',
  'US-01.1 AC7: the same login from another address is not affected');

do $$
begin
  for i in 1..29 loop
    perform login_attempt_begin('ipb' || i || '@staff.pgtap.invalid', '203.0.113.8');
    perform login_attempt_end('ipb' || i || '@staff.pgtap.invalid', '203.0.113.8', false);
  end loop;
  perform login_attempt_begin('ipb-ok@staff.pgtap.invalid', '203.0.113.8');
  perform login_attempt_end('ipb-ok@staff.pgtap.invalid', '203.0.113.8', true);
end $$;
select is(login_attempt_begin('ipb-30@staff.pgtap.invalid', '203.0.113.8') ->> 'allowed', 'true',
  'US-01.1 AC7: a successful sign-in is not counted as a failure of the address');
select login_attempt_end('ipb-30@staff.pgtap.invalid', '203.0.113.8', false);
select is(login_attempt_begin('ipb-31@staff.pgtap.invalid', '203.0.113.8') ->> 'allowed', 'false',
  'US-01.1 AC7: the thirtieth failure locks it');

select login_attempt_begin('bez-adrese@staff.pgtap.invalid', '  ');
select ok(not exists (select 1 from private.login_throttle where key in ('ip:', 'ip:  ')),
  'D-75: without an address only the login is counted');

-- Two more locked staff logins for S-23: the second owner and the manager.
do $$
begin
  for i in 1..5 loop
    perform login_attempt_begin('pgtap.lt.vlasnik2@staff.pgtap.invalid', null);
    perform login_attempt_end('pgtap.lt.vlasnik2@staff.pgtap.invalid', null, false);
    perform login_attempt_begin('pgtap.lt.drugi@staff.pgtap.invalid', null);
    perform login_attempt_end('pgtap.lt.drugi@staff.pgtap.invalid', null, false);
  end loop;
end $$;

-- S-23 and P-08 --------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims = '{"sub": "75757575-0000-0000-0000-00000000a004"}';
select throws_ok('select * from staff_login_locks()', 'P0001', 'E_FORBIDDEN',
  'P-04: a receptionist has no S-23 and sees no locks');

set local request.jwt.claims = '{"sub": "75757575-0000-0000-0000-00000000a003"}';
select is(
  (select array_agg(staff_id order by staff_id)::text from staff_login_locks()),
  '{75757575-0000-0000-0000-00000000c004,75757575-0000-0000-0000-00000000c005}',
  'S-23: the manager sees which accounts of the gym are locked, not other gyms''');
select is(
  (select locked_until from staff_login_locks()
   where staff_id = '75757575-0000-0000-0000-00000000c004'),
  now() + interval '15 minutes', 'S-23: and until when');
select throws_ok($$select unlock_staff_login('75757575-0000-0000-0000-00000000c004')$$,
  'P0001', 'E_FORBIDDEN', 'P-08: the manager cannot unlock');

set local request.jwt.claims = '{"sub": "75757575-0000-0000-0000-00000000a002"}';
select throws_ok($$select unlock_staff_login('75757575-0000-0000-0000-00000000c005')$$,
  'P0001', 'E_FORBIDDEN', 'P-08 and D-58: an owner cannot unlock another owner');
select throws_ok($$select unlock_staff_login('75757575-0000-0000-0000-00000000c006')$$,
  'P0001', 'E_FORBIDDEN', 'P-08: nor an account of another gym');
select lives_ok($$select unlock_staff_login('75757575-0000-0000-0000-00000000c004')$$,
  'P-08: the owner unlocks the receptionist');
select is(
  (select count(*)::int from staff_login_locks()
   where staff_id = '75757575-0000-0000-0000-00000000c004'), 0,
  'P-08: who is no longer listed as locked');
select lives_ok($$select unlock_staff_login('75757575-0000-0000-0000-00000000c004')$$,
  'P-08: a second unlock changes nothing and is no error');

set local request.jwt.claims = '{"sub": "75757575-0000-0000-0000-00000000a001"}';
select lives_ok($$select unlock_staff_login('75757575-0000-0000-0000-00000000c005')$$,
  'P-08 and D-58: the admin unlocks an owner');

reset role;
select is(login_attempt_begin('pgtap.lt.ana@staff.pgtap.invalid', null) ->> 'allowed', 'true',
  'P-08: the unlocked login may sign in at once');
select is((select attempts::int from private.login_throttle
           where key = 'login:pgtap.lt.ana@staff.pgtap.invalid'), 1,
  'P-08: with its failures cleared');
select is(
  (select count(*)::int from audit_log
   where row_id = '75757575-0000-0000-0000-00000000c004'
     and new_data ? 'login_locked_until' and new_data ->> 'login_locked_until' is null
     and changed_by = '75757575-0000-0000-0000-00000000c002'),
  1, 'BR-096: the unlock is in Dnevnik izmjena once, by the owner');
select is(
  (select count(*)::int from audit_log
   where row_id = '75757575-0000-0000-0000-00000000c005'
     and new_data ->> 'login_locked_until' is null
     and changed_by = '75757575-0000-0000-0000-00000000c001'),
  1, 'BR-096: and the admin''s unlock of the owner');
select is(
  (select count(*)::int from private.login_throttle
   where key = 'login:pgtap.lt.drugi@staff.pgtap.invalid' and locked_until > now()),
  1, 'P-08: the other gym''s lock is untouched');

select * from finish();
