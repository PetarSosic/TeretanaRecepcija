-- D-90: policies ask who the caller is once per statement, and the reports read a period
-- as a range of instants. The answers must be the ones gym_local_date() gave, at the
-- edges of a local day and across a daylight-saving change included.
select plan(13);

insert into auth.users (id, email) values ('90909090-0000-0000-0000-00000000a001', null);
insert into gyms (id, name, timezone)
values ('90909090-0000-0000-0000-00000000b001', 'pgTAP Opsezi', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('90909090-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('90909090-0000-0000-0000-00000000c001', '90909090-0000-0000-0000-00000000b001',
   '90909090-0000-0000-0000-00000000a001', 'owner', 'pgTAP Opsezi Vlasnik',
   'pgtap.ops.vlasnik');
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by)
values ('90909090-0000-0000-0000-000000010001', '90909090-0000-0000-0000-00000000b001', 1,
        'Opseg', 'Član', '+38267000901', 'ops1@pgtap.invalid', '1990-01-01',
        '90909090-0000-0000-0000-00000000c001');

-- 10.01.2026 at 23:30 and 11.01.2026 at 00:10 in Podgorica. The second is still
-- 10.01. in UTC, so a UTC day would count both on the 10th.
insert into visits (gym_id, member_id, visit_type, checked_in_at, checked_in_by,
                    checked_out_at, auto_checkout) values
  ('90909090-0000-0000-0000-00000000b001', '90909090-0000-0000-0000-000000010001', 'gym',
   '2026-01-10 22:30:00+00', '90909090-0000-0000-0000-00000000c001',
   '2026-01-10 22:45:00+00', false),
  ('90909090-0000-0000-0000-00000000b001', '90909090-0000-0000-0000-000000010001', 'gym',
   '2026-01-10 23:10:00+00', '90909090-0000-0000-0000-00000000c001',
   '2026-01-10 23:30:00+00', false);

-- gym_day_start ------------------------------------------------------------------------
select is(
  gym_day_start('90909090-0000-0000-0000-00000000b001', '2026-01-11'),
  '2026-01-10 23:00:00+00'::timestamptz,
  'D-90: a winter day starts at 23:00 UTC the day before'
);
select is(
  gym_day_start('90909090-0000-0000-0000-00000000b001', '2026-07-01'),
  '2026-06-30 22:00:00+00'::timestamptz,
  'D-90: a summer day starts at 22:00 UTC the day before'
);
select is(
  gym_day_start('90909090-0000-0000-0000-00000000b001', '2026-03-30')
    - gym_day_start('90909090-0000-0000-0000-00000000b001', '2026-03-29'),
  interval '23 hours',
  'D-90: the day the clocks go forward is 23 hours long'
);
select is(
  gym_day_start('90909090-0000-0000-0000-00000000b001', '2026-10-26')
    - gym_day_start('90909090-0000-0000-0000-00000000b001', '2026-10-25'),
  interval '25 hours',
  'D-90: the day the clocks go back is 25 hours long'
);

-- visit_stats at the edge of a local day ---------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "90909090-0000-0000-0000-00000000a001"}';

select is(
  (visit_stats('2026-01-10', '2026-01-10') ->> 'total')::int,
  1,
  'BR-001: 23:30 local belongs to its own day'
);
select is(
  (visit_stats('2026-01-11', '2026-01-11') ->> 'total')::int,
  1,
  'BR-001: 00:10 local belongs to the next day, though it is the day before in UTC'
);
select is(
  (visit_stats('2026-01-10', '2026-01-11') -> 'days')::jsonb,
  '[{"day": "2026-01-10", "count": 1}, {"day": "2026-01-11", "count": 1}]'::jsonb,
  'BR-001: each visit is counted on its local day'
);
select is(
  (visit_stats('2026-01-10', '2026-01-11') ->> 'total')::int,
  (select count(*)::int from visits
   where gym_id = '90909090-0000-0000-0000-00000000b001'
     and gym_local_date(gym_id, checked_in_at) between '2026-01-10' and '2026-01-11'),
  'D-90: the same count gym_local_date() gives'
);
reset role;

-- Policies -----------------------------------------------------------------------------
-- A helper call left outside a sub-select would run once for every row again. Each
-- "( SELECT … AS name)" is removed; nothing that names the caller may remain.
select is(
  (select count(*)::int
   from pg_policies p,
        lateral (select regexp_replace(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
                                       '\( SELECT .*? AS [a-z_]+\)', '', 'g') as rest) r
   where p.schemaname in ('public', 'storage')
     and r.rest ~ '(my_gym|my_role|current_staff|gym_today|gym_local_date)\(|auth\.uid\('),
  0,
  'D-90: no policy asks who the caller is once per row'
);
select ok(
  (select qual from pg_policies
   where schemaname = 'public' and policyname = 'stock_movements_select')
    !~ 'gym_local_date',
  'D-90: the desk''s "today only" bar movements are a range of instants'
);

-- Indexes ------------------------------------------------------------------------------
select has_index('public', 'stock_movements', 'stock_movements_gym_time_idx',
                 'D-90: bar movements by gym and time');
select has_index('public', 'memberships', 'memberships_gym_end_idx',
                 'D-90: memberships by gym and end date');
select has_index('public', 'visits', 'visits_trainer_time_idx',
                 'D-90: sessions by trainer and time');

select * from finish();
