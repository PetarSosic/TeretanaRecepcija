-- M-00 harness checks. Business schemas and RLS are introduced in M-01.
-- The runner starts a transaction, loads pgTAP and always rolls back.
select plan(3);
select ok(current_setting('server_version_num')::integer >= 150000, 'Postgres 15 or newer');
select is(round(1.005::numeric, 2), 1.01::numeric, 'BR-003: numeric rounds half-up');
select is(
  (timestamptz '2026-01-01 23:30:00+00' at time zone 'Europe/Podgorica')::date,
  date '2026-01-02',
  'BR-001: Podgorica date across midnight UTC'
);
select * from finish();
