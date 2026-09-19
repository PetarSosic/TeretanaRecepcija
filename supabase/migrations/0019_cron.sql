-- M-11: what the backup export still needed, and the pg_cron schedule of doc 08 §8.

/** BR-163: the columns of one table, so an empty table still gets a CSV header. */
create function backup_table_columns(p_table text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}')
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname = p_table
    and a.attnum > 0 and not a.attisdropped;
$$;

/** BR-163: the migration the export was taken at, for `manifest.json`. */
create function backup_schema_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select max(version)::text from supabase_migrations.schema_migrations;
$$;

revoke execute on function backup_table_columns(text), backup_schema_version()
  from public, anon, authenticated;
grant execute on function backup_table_columns(text), backup_schema_version()
  to service_role;

-- Scheduled jobs (doc 08 §8) ------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

/**
 * Doc 08 §8: every five minutes, poke each job handler; the handler decides whether its
 * job is due for any gym. The application address and the shared secret live in Supabase
 * Vault rather than in this migration, so nothing secret is ever committed, and they are
 * read at each run — until they are set (`scripts/set-cron-secrets.mjs`) the call is
 * skipped, which is what happens in development.
 */
create function run_scheduled_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_job    text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  foreach v_job in array array['nightly', 'morning', 'weekly-backup', 'email-retry'] loop
    perform net.http_post(
      url     := rtrim(v_url, '/') || '/api/jobs/' || v_job,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cron-secret', v_secret),
      body    := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  end loop;
end;
$$;

revoke execute on function run_scheduled_jobs() from public, anon, authenticated;

select cron.schedule('kp-fitness-jobs', '*/5 * * * *', 'select public.run_scheduled_jobs()');
