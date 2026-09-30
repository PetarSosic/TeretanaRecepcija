-- D-83: pg_cron posts to a job handler only when that job has work (doc 08 §8), instead
-- of posting to all four every five minutes. D-84: the automatic check-out (BR-082a) runs
-- every five minutes instead of every minute. Both cut requests and log lines that found
-- nothing to do.

/**
 * Doc 08 §8 (D-83): every five minutes, post only to the handlers whose job has work: a
 * gym that `jobs_due` answers for (nightly, morning, backup), or a shift whose report
 * email waits for another attempt (BR-118, email-retry). These are the same read-only
 * functions the handlers call, so the database only filters the calls; each handler
 * still checks for itself and stays idempotent. A handler that fails leaves its job due,
 * so the next run posts to it again. A check that fails posts anyway, so the handler
 * meets and reports the problem as it did before this filter existed.
 */
create or replace function run_scheduled_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_job    text;
  v_due    boolean;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  foreach v_job in array array['nightly', 'morning', 'weekly-backup', 'email-retry'] loop
    begin
      v_due := case v_job
        when 'nightly'       then exists (select 1 from jobs_due('nightly'))
        when 'morning'       then exists (select 1 from jobs_due('morning'))
        when 'weekly-backup' then exists (select 1 from jobs_due('backup'))
        when 'email-retry'   then exists (select 1 from shifts_pending_email())
      end;
    exception when others then
      v_due := true;
    end;

    if v_due then
      perform net.http_post(
        url     := rtrim(v_url, '/') || '/api/jobs/' || v_job,
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-cron-secret', v_secret),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    end if;
  end loop;
end;
$$;

revoke execute on function run_scheduled_jobs() from public, anon, authenticated;

-- D-84 (BR-082a, BR-162): the check-out time stays exact (check-in plus 1 h 30 min); only
-- the moment the member leaves "U teretani" can be up to five minutes later.
select cron.schedule('kp-fitness-auto-checkout', '*/5 * * * *', 'select public.job_auto_checkout()');
