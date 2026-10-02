-- D-100 (BR-056): a membership may be paused, 7 days at most in total, by any staff role,
-- from today or later and inside its validity. Each paused day moves "Važi do" and the
-- memberships chained after it; a paused day covers nothing. A member who comes in ends
-- the pause that day and keeps only the days already paused; [Prekini pauzu] does the same.
select plan(30);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('32323232-0000-0000-0000-00000000a001', null),
  ('32323232-0000-0000-0000-00000000a002', null);
insert into gyms (id, name, timezone)
values ('32323232-0000-0000-0000-00000000b001', 'pgTAP Pauza', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('32323232-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('32323232-0000-0000-0000-00000000c001', '32323232-0000-0000-0000-00000000b001',
   '32323232-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija', 'pgtap.pz.recepcija'),
  ('32323232-0000-0000-0000-00000000c002', '32323232-0000-0000-0000-00000000b001',
   '32323232-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.pz.vlasnik');
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal,
                   gym_visit_limit, group_session_limit, requires_trainer, sort_order)
values ('32323232-0000-0000-0000-00000000f001', '32323232-0000-0000-0000-00000000b001',
        'pgTAP Mjesečna', 'gym', 1, 'month', 79, true, false, false, null, null, false, 1);
insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct)
values ('32323232-0000-0000-0000-00000000f001', '32323232-0000-0000-0000-00000000b001', 0, null);
insert into shifts (id, gym_id, staff_id)
values ('32323232-0000-0000-0000-000000040001', '32323232-0000-0000-0000-00000000b001',
        '32323232-0000-0000-0000-00000000c001');

-- The gym's today (BR-001).
create temporary table t as select gym_today('32323232-0000-0000-0000-00000000b001') as d;
grant select on t to authenticated;

-- Ana (1), Bo with a renewal chained after his membership (2), Cvijeta who came today (3)
-- and Dara whose pause began two days ago (4).
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by)
select ('32323232-0000-0000-0000-00000002000' || n)::uuid, '32323232-0000-0000-0000-00000000b001',
       n, name, 'Pauza', '+3826732000' || n, lower(name) || '@pgtap.invalid', date '1990-01-01',
       '32323232-0000-0000-0000-00000000c002'
from (values (1, 'Ana'), (2, 'Bo'), (3, 'Cvijeta'), (4, 'Dara')) v(n, name);

insert into memberships (id, gym_id, member_id, plan_id, start_date, end_date, start_reason,
                         covers_gym, covers_group, covers_personal, created_by, shift_id)
select ('32323232-0000-0000-0000-00000003000' || n)::uuid, '32323232-0000-0000-0000-00000000b001',
       ('32323232-0000-0000-0000-00000002000' || member)::uuid,
       '32323232-0000-0000-0000-00000000f001', (select d from t) + s, (select d from t) + e,
       reason, true, false, false, '32323232-0000-0000-0000-00000000c001',
       '32323232-0000-0000-0000-000000040001'
from (values
  (1, 1, -10, 20, 'Počinje danas'),
  (2, 2, -5, 5, 'Počinje danas'),
  (3, 2, 6, 36, 'Nastavlja se na članarinu koja važi do '
                || to_char((select d from t) + 5, 'DD.MM.YYYY')),
  (4, 3, -3, 27, 'Počinje danas'),
  (5, 4, -20, 14, 'Počinje danas')
) v(n, member, s, e, reason);

-- Cvijeta's visit this morning, and Dara's pause of four days from the day before yesterday.
insert into visits (gym_id, member_id, membership_id, visit_type, checked_in_at, checked_out_at,
                    checked_in_by, shift_id)
values ('32323232-0000-0000-0000-00000000b001', '32323232-0000-0000-0000-000000020003',
        '32323232-0000-0000-0000-000000030004', 'gym', now() - interval '1 minute', now(),
        '32323232-0000-0000-0000-00000000c001', '32323232-0000-0000-0000-000000040001');
insert into membership_pauses (gym_id, membership_id, paused_from, paused_until, created_by)
values ('32323232-0000-0000-0000-00000000b001', '32323232-0000-0000-0000-000000030005',
        (select d from t) - 2, (select d from t) + 1, '32323232-0000-0000-0000-00000000c002');

-- The receptionist pauses -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "32323232-0000-0000-0000-00000000a001"}';
set local role authenticated;

select lives_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t), 3)$$,
  'D-100: a receptionist pauses Ana''s membership for 3 days from today');
select is(
  (select end_date from memberships where id = '32323232-0000-0000-0000-000000030001'),
  (select d from t) + 23, 'D-100: "Važi do" moves 3 days later');
select is(
  membership_status('32323232-0000-0000-0000-000000030001', (select d from t)),
  'paused', 'BR-054 (D-100): today it is "Pauzirana"');
select is(
  membership_covers('32323232-0000-0000-0000-000000030001', 'gym', (select d from t)),
  false, 'BR-053 (D-100): a paused day covers nothing');
select is(
  membership_covers('32323232-0000-0000-0000-000000030001', 'gym', (select d from t) + 3),
  true, 'BR-053: the day after the pause is covered again');
select throws_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t) + 1, 1)$$,
  'E_PAUSE_OVERLAP', 'D-100: two pauses never overlap');
select throws_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t) + 10, 5)$$,
  'E_PAUSE_TOO_LONG', 'D-100: 3 + 5 days is more than 7');
select throws_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t) - 1, 1)$$,
  'E_PAUSE_INVALID', 'D-100: a pause never begins in the past');
select throws_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t) + 24, 1)$$,
  'E_PAUSE_INVALID', 'D-100: nor after the last valid day');
select throws_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t) + 10, 0)$$,
  'E_PAUSE_INVALID', 'D-100: nor for no day');
select throws_ok(
  $$select pause_membership(gen_random_uuid(), (select d from t), 1)$$,
  'E_FORBIDDEN', 'D-100: nor on a membership of another gym');
select lives_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030001', (select d from t) + 10, 4)$$,
  'D-100: a second pause of 4 days brings the total to 7');
select is(
  (select end_date::text || '|' || membership_paused_days(id)
   from memberships where id = '32323232-0000-0000-0000-000000030001'),
  ((select d from t) + 27)::text || '|7', 'D-100: 7 days paused, "Važi do" 7 days later');
select is(
  (select paused_days || '|' || json_array_length(pauses)
   from member_memberships('32323232-0000-0000-0000-000000020001')),
  '7|2', 'S-07: the profile lists both pauses');

-- Ana comes in on the first day of her pause ------------------------------------------
select is(
  (begin_check_in('32323232-0000-0000-0000-000000020001') -> 'pause_ended')::text,
  'true', 'D-100: her check-in ends the pause and says so');
select is(
  (select count(*)::int from visits
   where membership_id = '32323232-0000-0000-0000-000000030001' and not is_unpaid),
  1, 'D-100: and the membership covers the visit');
select is(
  (select end_date::text || '|' || membership_paused_days(id)
   from memberships where id = '32323232-0000-0000-0000-000000030001'),
  ((select d from t) + 24)::text || '|4',
  'D-100: the 3 unused days go back; the pause still to come keeps its 4');

-- [Prekini pauzu] on the pause that has not begun ---------------------------------------
select lives_ok(
  $$select end_membership_pause((select id from membership_pauses
      where membership_id = '32323232-0000-0000-0000-000000030001'
        and paused_from = (select d from t) + 10))$$,
  'D-100: [Prekini pauzu] on a pause still to come');
select is(
  (select end_date::text || '|' || membership_paused_days(id)
   from memberships where id = '32323232-0000-0000-0000-000000030001'),
  ((select d from t) + 20)::text || '|0', 'D-100: it is given back whole');
select throws_ok(
  $$select end_membership_pause((select id from membership_pauses
      where membership_id = '32323232-0000-0000-0000-000000030001'
        and paused_from = (select d from t) + 10))$$,
  'E_PAUSE_INVALID', 'D-100: a pause that is over cannot be ended again');

-- Bo's renewal follows his membership ----------------------------------------------------
select lives_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030002', (select d from t) + 1, 2)$$,
  'D-100: Bo''s membership is paused for 2 days from tomorrow');
select is(
  (select start_date::text || '|' || end_date || '|' || start_reason
   from memberships where id = '32323232-0000-0000-0000-000000030003'),
  ((select d from t) + 8)::text || '|' || ((select d from t) + 38)
    || '|Nastavlja se na članarinu koja važi do ' || to_char((select d from t) + 7, 'DD.MM.YYYY'),
  'D-100 (BR-052 step 1): the renewal chained after it moves 2 days, and its reason with it');

-- Cvijeta already came today -------------------------------------------------------------
select throws_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030004', (select d from t), 2)$$,
  'E_PAUSE_VISITED', 'D-100: a pause cannot begin on a day she already came');
select lives_ok(
  $$select pause_membership('32323232-0000-0000-0000-000000030004', (select d from t) + 1, 2)$$,
  'D-100: from tomorrow it can');

-- Dara comes in on the third day of her pause --------------------------------------------
select is(
  (begin_check_in('32323232-0000-0000-0000-000000020004') -> 'pause_ended')::text,
  'true', 'D-100: Dara''s check-in ends a pause that began two days ago');

reset role;
select is(
  (select end_date::text || '|' || membership_paused_days(id)
   from memberships where id = '32323232-0000-0000-0000-000000030005'),
  ((select d from t) + 12)::text || '|2',
  'D-100: the 2 days already paused stay, the 2 not used go back');
select is(
  (select paused_until::text || '|' || ended_early from membership_pauses
   where membership_id = '32323232-0000-0000-0000-000000030005'),
  ((select d from t) - 1)::text || '|true', 'D-100: the pause now ends yesterday');
select is(
  (select paused_until::text || '|' || ended_early from membership_pauses
   where membership_id = '32323232-0000-0000-0000-000000030001'
     and paused_from = (select d from t)),
  ((select d from t) - 1)::text || '|true',
  'D-100: Ana''s first pause holds no day any more, and the row says it was ended');
select is(
  (select count(*)::int from audit_log
   where table_name = 'membership_pauses'
     and gym_id = '32323232-0000-0000-0000-00000000b001'),
  8, 'BR-096: every pause (5) and every end of one (3) is audited');
select is(
  (select count(*)::int from membership_pauses
   where gym_id = '32323232-0000-0000-0000-00000000b001'),
  5, 'D-100: nothing is deleted; every pause keeps its row');

select * from finish();
