-- D-83: pg_cron posts to a job handler only when that job has work (doc 08 §8), and a
-- check that fails posts anyway. Nothing leaves the database: pg_net only queues its
-- requests in this transaction, which the runner rolls back, and Vault points at a
-- marker address meanwhile.
select plan(11);

-- Fixtures --------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'app_url';
  if v_id is null then
    perform vault.create_secret('https://pgtap.invalid', 'app_url');
  else
    perform vault.update_secret(v_id, 'https://pgtap.invalid');
  end if;
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret('pgtap-secret', 'cron_secret');
  end if;
end;
$$;

insert into auth.users (id, email) values ('80808080-0000-0000-0000-00000000a001', null);
insert into gyms (id, name, timezone)
values ('80808080-0000-0000-0000-00000000b001', 'pgTAP Pozivi poslova', 'Europe/Podgorica');
insert into gym_settings (gym_id, auto_close_time)
values ('80808080-0000-0000-0000-00000000b001', '00:00');
insert into staff (id, gym_id, user_id, role, full_name, username)
values ('80808080-0000-0000-0000-00000000c001', '80808080-0000-0000-0000-00000000b001',
        '80808080-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Recepcija',
        'pgtap.jp.recepcija');
insert into shifts (id, gym_id, staff_id)
values ('80808080-0000-0000-0000-00000000d001', '80808080-0000-0000-0000-00000000b001',
        '80808080-0000-0000-0000-00000000c001');

-- No job has work: every gym has run all three jobs today, and no report email waits.
insert into job_runs (gym_id, job, run_date)
select g.id, j.job, gym_today(g.id)
from gyms g cross join (values ('nightly'), ('morning'), ('backup')) as j(job)
on conflict do nothing;
update shifts set email_status = 'sent' where email_status = 'failed';

-- D-83 ------------------------------------------------------------------------------
select is((select schedule from cron.job where jobname = 'kp-fitness-jobs'),
  '*/5 * * * *', 'D-83: pg_cron still looks for work every five minutes');

select run_scheduled_jobs();
select is(
  (select count(*) from net.http_request_queue where url like 'https://pgtap.invalid/%'),
  0::bigint, 'D-83: with no job due and no email waiting, nothing is posted');

-- The nightly job becomes due for the fixture gym alone (its close time is 00:00).
delete from job_runs
where gym_id = '80808080-0000-0000-0000-00000000b001' and job = 'nightly';
select run_scheduled_jobs();
select is(
  (select count(*) from net.http_request_queue
   where url = 'https://pgtap.invalid/api/jobs/nightly'),
  1::bigint, 'D-83: a due job is posted to');
select is(
  (select count(*) from net.http_request_queue where url like 'https://pgtap.invalid/%'),
  1::bigint, 'D-83: only the due job is posted to');
select ok(
  (select bool_and(headers ->> 'x-cron-secret' is not null)
   from net.http_request_queue where url like 'https://pgtap.invalid/%'),
  'D-83: the post carries the shared secret');

-- BR-118: a failed report email waits for another attempt.
update shifts
set email_status = 'failed', email_attempts = 1, emailed_at = now() - interval '20 minutes'
where id = '80808080-0000-0000-0000-00000000d001';
select run_scheduled_jobs();
select is(
  (select count(*) from net.http_request_queue
   where url = 'https://pgtap.invalid/api/jobs/email-retry'),
  1::bigint, 'D-83: a waiting report email is posted to email-retry');
select is(
  (select count(*) from net.http_request_queue
   where url = 'https://pgtap.invalid/api/jobs/nightly'),
  2::bigint, 'D-83: a job that has not recorded its run stays due, so a failed handler is retried');

-- A gym whose time zone is unknown makes jobs_due fail for every job.
insert into gyms (id, name, timezone)
values ('80808080-0000-0000-0000-00000000b002', 'pgTAP Pokvarena zona', 'Nigdje/Nista');
insert into gym_settings (gym_id) values ('80808080-0000-0000-0000-00000000b002');
select lives_ok('select run_scheduled_jobs()',
  'D-83: a check that fails does not stop the other jobs');
select is(
  (select count(*) from net.http_request_queue
   where url in ('https://pgtap.invalid/api/jobs/morning',
                 'https://pgtap.invalid/api/jobs/weekly-backup')),
  2::bigint, 'D-83: a check that fails posts anyway, so the handler reports the problem');
select is(
  (select count(*) from net.http_request_queue
   where url = 'https://pgtap.invalid/api/jobs/email-retry'),
  2::bigint, 'D-83: the check of one job does not depend on another');

-- D-84 ------------------------------------------------------------------------------
select is((select schedule from cron.job where jobname = 'kp-fitness-auto-checkout'),
  '*/5 * * * *', 'D-84: pg_cron runs the automatic check-out every five minutes');

select * from finish();
