-- D-88: pg_cron records every run in cron.job_run_details and never deletes one (about
-- 580 rows a day after D-84, for as long as the project lives). A daily job keeps the
-- last 7 days, which is enough to look into a job that misbehaved, and the table stops
-- growing.

/**
 * D-88: delete the pg_cron run records that ended (or, never having ended, started)
 * longer than `p_keep` ago. Returns how many went. Only pg_cron calls it.
 */
create function purge_cron_log(p_keep interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from cron.job_run_details
  where coalesce(end_time, start_time) < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function purge_cron_log(interval) from public, anon, authenticated;

-- 03:17 UTC, away from the nightly and morning jobs and off the full hour.
select cron.schedule('kp-fitness-cron-log-cleanup', '17 3 * * *', 'select public.purge_cron_log()');
