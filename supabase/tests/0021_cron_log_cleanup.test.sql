-- D-88: a daily pg_cron job deletes the run records older than 7 days. The runner rolls
-- this transaction back, so the records deleted here stay in place.
select plan(6);

-- Two runs from last week and one from today, marked so they can be told apart.
-- The run ids are given, since only pg_cron may draw from its own sequence.
insert into cron.job_run_details (jobid, runid, command, status, start_time, end_time)
values
  (0, -880001, 'pgtap-d88-old', 'succeeded', now() - interval '8 days', now() - interval '8 days'),
  (0, -880002, 'pgtap-d88-old', 'failed', now() - interval '30 days', null),
  (0, -880003, 'pgtap-d88-new', 'succeeded', now() - interval '1 hour', now() - interval '1 hour');

select is(
  (select schedule from cron.job where jobname = 'kp-fitness-cron-log-cleanup'),
  '17 3 * * *',
  'D-88: the cleanup runs once a day'
);
select is(
  (select command from cron.job where jobname = 'kp-fitness-cron-log-cleanup'),
  'select public.purge_cron_log()',
  'D-88: the cleanup calls purge_cron_log()'
);

select cmp_ok(purge_cron_log(), '>=', 2, 'D-88: the old runs are deleted and counted');
select is(
  (select count(*)::int from cron.job_run_details where command = 'pgtap-d88-old'),
  0,
  'D-88: nothing older than 7 days is left, a run that never ended included'
);
select is(
  (select count(*)::int from cron.job_run_details where command = 'pgtap-d88-new'),
  1,
  'D-88: the last 7 days are kept'
);

select ok(
  not has_function_privilege('authenticated', 'purge_cron_log(interval)', 'execute')
    and not has_function_privilege('anon', 'purge_cron_log(interval)', 'execute'),
  'D-88: no app role may call purge_cron_log()'
);

select * from finish();
