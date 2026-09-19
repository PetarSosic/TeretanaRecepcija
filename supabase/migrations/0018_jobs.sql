-- M-11: the scheduled jobs and the weekly backup (F-25, F-26, F-28).
-- The notification and backup tables of doc 07 §3, the private `backups` bucket
-- (doc 07 §6), the job RPCs behind BR-160, BR-162 and BR-163, and the BR-118 retry
-- queue. Every job function is callable by the service role only: the handlers of
-- doc 08 §8 run them, never the browser.

-- Tables (doc 07 §3) --------------------------------------------------------------------
create table expiry_notifications (
  membership_id uuid primary key references memberships(id),
  gym_id        uuid not null references gyms(id),
  sent_at       timestamptz,
  status        email_status not null default 'pending',
  error         text
);

create table backup_runs (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id),
  run_date    date not null,
  attempt     smallint not null default 1 check (attempt between 1 and 3),
  status      text not null check (status in ('running', 'success', 'failed')),
  file_path   text,                                    -- Storage: backups/<gym_id>/kpfitness-backup-<date>.zip
  size_bytes  bigint,
  emailed     boolean not null default false,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (gym_id, run_date, attempt)
);
-- Not in doc 07: S-27 reads the newest run of the gym (BR-163).
create index backup_runs_recent_idx on backup_runs (gym_id, run_date desc, attempt desc);

-- RLS (doc 07 §6: the owner and admin read, nobody writes) -------------------------------
alter table expiry_notifications enable row level security;
alter table backup_runs          enable row level security;

create policy expiry_notifications_select on expiry_notifications
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());

create policy backup_runs_select on backup_runs
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());

revoke all on expiry_notifications, backup_runs from anon, authenticated;
grant select on expiry_notifications, backup_runs to authenticated;

-- Storage (doc 07 §6) -------------------------------------------------------------------
-- `backups` holds members' personal data and the readable staff passwords of D-59 inside
-- an encrypted ZIP: no staff role may read it, so the bucket gets no policy at all and
-- only the service role (the backup job and the developer) reaches it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 104857600, array['application/zip'])
on conflict (id) do nothing;

-- Job scheduling (doc 08 §8) ------------------------------------------------------------

/**
 * BR-162: the gyms whose local time has reached the job's schedule today and which have
 * not run it yet. pg_cron calls the handlers every five minutes, so the answer is empty
 * on almost every call; `job_runs` is what makes a job idempotent, and it is written by
 * the job itself, not here.
 *
 * The backup is extra: it runs on Sunday only (AS-21) and stops after the third attempt
 * of the day (BR-163).
 */
create function jobs_due(p_job text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from gyms g
  join gym_settings s on s.gym_id = g.id
  where not exists (
          select 1 from job_runs r
          where r.gym_id = g.id and r.job = p_job and r.run_date = gym_today(g.id))
    and case p_job
          when 'nightly' then (now() at time zone g.timezone)::time >= s.auto_close_time
          when 'morning' then (now() at time zone g.timezone)::time >= time '09:00'
          when 'backup'  then extract(dow from (now() at time zone g.timezone)) = 0
                          and (now() at time zone g.timezone)::time >= time '03:00'
                          and (select count(*) from backup_runs b
                               where b.gym_id = g.id and b.run_date = gym_today(g.id)) < 3
          else false
        end;
$$;

/**
 * BR-162 nightly (BR-082 and BR-116): close every open visit and then the open shift, at
 * the gym's automatic close time today rather than at the moment the handler happens to
 * run. The `job_runs` row is claimed first, so two handlers racing on the same minute
 * leave exactly one of them with work to do; the other gets `ran = false` and stops.
 *
 * The caller (doc 08 §8) sends the report of the shift named in the answer.
 */
create function job_nightly(p_gym uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at     timestamptz;
  v_visits integer;
  v_shift  uuid;
begin
  insert into job_runs (gym_id, job, run_date)
  values (p_gym, 'nightly', gym_today(p_gym))
  on conflict do nothing;
  if not found then
    return json_build_object('ran', false);
  end if;

  select (gym_today(p_gym) + s.auto_close_time) at time zone g.timezone
  into v_at
  from gyms g join gym_settings s on s.gym_id = g.id
  where g.id = p_gym;

  -- BR-082: the visit ends at the close time, unless it began later (a check-in between
  -- the close time and the handler's run), which no check constraint would allow.
  update visits
  set checked_out_at = greatest(v_at, checked_in_at),
      auto_checkout  = true
  where gym_id = p_gym and checked_out_at is null;
  get diagnostics v_visits = row_count;

  -- BR-116: closed with no counted cash and nobody as the closer.
  update shifts
  set closed_at  = greatest(v_at, started_at),
      close_type = 'auto'
  where gym_id = p_gym and closed_at is null
  returning id into v_shift;

  return json_build_object(
    'ran', true,
    'closed_at', v_at,
    'visits_closed', v_visits,
    'shift_id', v_shift
  );
end;
$$;

/**
 * BR-160: the memberships that end in `expiry_reminder_days` days and deserve a reminder
 * today. A reminder is skipped for an anonymized member (BR-046), for a member without an
 * email, for a membership already renewed — a later non-voided membership sharing at least
 * one visit type, which is what BR-052 calls comparable — and for one that already has a
 * notification row, which is how "no reminder was sent before" is remembered.
 *
 * The rows are written as `pending` here and settled by `record_expiry_notification` once
 * the handler knows what Resend did, so a crash between the two never sends twice.
 */
create function job_expiring_memberships(p_gym uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due  date;
  v_rows json;
begin
  insert into job_runs (gym_id, job, run_date)
  values (p_gym, 'morning', gym_today(p_gym))
  on conflict do nothing;
  if not found then
    return json_build_object('ran', false, 'reminders', '[]'::json);
  end if;

  select gym_today(p_gym) + s.expiry_reminder_days into v_due
  from gym_settings s where s.gym_id = p_gym;

  with due as (
    select m.id, m.end_date, mem.first_name, mem.email, p.name as plan_name, g.name as gym_name
    from memberships m
    join members mem on mem.id = m.member_id
    join plans p     on p.id = m.plan_id
    join gyms g      on g.id = m.gym_id
    where m.gym_id = p_gym
      and m.voided_at is null
      and m.end_date = v_due
      and not mem.is_anonymized
      and mem.email is not null
      and not exists (
        select 1 from memberships later
        where later.member_id = m.member_id
          and later.voided_at is null
          and later.start_date > m.start_date
          and ((later.covers_gym and m.covers_gym)
            or (later.covers_group and m.covers_group)
            or (later.covers_personal and m.covers_personal)))
      and not exists (select 1 from expiry_notifications n where n.membership_id = m.id)
  ), claimed as (
    insert into expiry_notifications (membership_id, gym_id)
    select id, p_gym from due
    returning membership_id
  )
  select coalesce(json_agg(json_build_object(
           'membership_id', d.id,
           'email', d.email,
           'first_name', d.first_name,
           'plan_name', d.plan_name,
           'gym_name', d.gym_name,
           'end_date', d.end_date
         ) order by d.id), '[]'::json)
  into v_rows
  from due d
  where d.id in (select membership_id from claimed);

  return json_build_object('ran', true, 'reminders', v_rows);
end;
$$;

/** BR-160: what Resend did with one reminder. */
create function record_expiry_notification(
  p_membership uuid,
  p_status     email_status,
  p_error      text default null
)
returns expiry_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row expiry_notifications;
begin
  update expiry_notifications
  set status  = p_status,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      error   = p_error
  where membership_id = p_membership
  returning * into v_row;
  return v_row;
end;
$$;

-- Weekly backup (BR-163) ----------------------------------------------------------------

/**
 * BR-163: claim the next attempt of the day, at most three. The row is the lock as well
 * as the record: the unique key on (gym, date, attempt) means two handlers cannot claim
 * the same attempt, and a `running` row left behind by a crashed handler still counts
 * towards the three.
 */
create function start_backup_run(p_gym uuid)
returns backup_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := gym_today(p_gym);
  v_next smallint;
  v_row  backup_runs;
begin
  select coalesce(max(attempt), 0) + 1 into v_next
  from backup_runs where gym_id = p_gym and run_date = v_date;
  if v_next > 3 then
    raise exception 'E_VALIDATION';
  end if;

  insert into backup_runs (gym_id, run_date, attempt, status)
  values (p_gym, v_date, v_next, 'running')
  returning * into v_row;
  return v_row;
end;
$$;

/**
 * BR-163: the outcome of one attempt. A success also writes the `job_runs` row, which is
 * what stops the job for the rest of the day; a failure leaves it unwritten so the next
 * five-minute run tries again, up to the three attempts `start_backup_run` allows.
 */
create function finish_backup_run(
  p_run     uuid,
  p_status  text,
  p_path    text default null,
  p_size    bigint default null,
  p_emailed boolean default false,
  p_error   text default null
)
returns backup_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row backup_runs;
begin
  update backup_runs
  set status      = p_status,
      file_path   = p_path,
      size_bytes  = p_size,
      emailed     = p_emailed,
      error       = p_error,
      finished_at = now()
  where id = p_run
  returning * into v_row;
  if v_row.id is null then
    raise exception 'E_VALIDATION';
  end if;

  if p_status = 'success' then
    insert into job_runs (gym_id, job, run_date)
    values (v_row.gym_id, 'backup', v_row.run_date)
    on conflict do nothing;
  end if;
  return v_row;
end;
$$;

/**
 * BR-163: the tables the backup covers. Everything in `public` is the gym's data; the
 * auth, storage and migration schemas of Supabase are not, and are never exported.
 */
create function backup_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by 1;
$$;

/**
 * BR-163: one table's rows for one gym, as json, for the CSV export. The keys keep the
 * table's own column order, so the CSV header matches the schema. `gyms` is the only
 * table keyed by `id` rather than `gym_id`.
 */
create function backup_table_rows(p_gym uuid, p_table text)
returns setof json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from backup_tables() t where t.table_name = p_table) then
    raise exception 'E_VALIDATION';
  end if;
  return query execute format(
    'select to_json(t) from public.%I t where %I = $1',
    p_table,
    case when p_table = 'gyms' then 'id' else 'gym_id' end
  ) using p_gym;
end;
$$;

-- BR-118 retry (doc 08 §8) --------------------------------------------------------------

/**
 * BR-118: the closed shifts whose report email failed, have fewer than five attempts, and
 * whose last attempt is at least fifteen minutes old. `emailed_at` holds the time of the
 * last attempt, which for a sent report is the time it went out.
 */
create function shifts_pending_email()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from shifts
  where email_status = 'failed'
    and email_attempts < 5
    and coalesce(emailed_at, closed_at) <= now() - interval '15 minutes'
  order by closed_at;
$$;

/**
 * M-10 recorded `emailed_at` only for a report that went out. BR-118's retry needs to
 * know when the last attempt was made, so a failure now stamps it too; for a sent report
 * the meaning is unchanged.
 */
create or replace function record_shift_report(p_shift uuid, p_report_path text, p_status email_status)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift shifts;
begin
  update shifts
  set report_path    = coalesce(p_report_path, report_path),
      email_status   = p_status,
      email_attempts = email_attempts + case when p_status in ('sent', 'failed') then 1 else 0 end,
      emailed_at     = case when p_status in ('sent', 'failed') then now() else emailed_at end
  where id = p_shift
  returning * into v_shift;
  return v_shift;
end;
$$;

-- Function privileges -------------------------------------------------------------------
-- The jobs belong to the handlers of doc 08 §8 and to nobody else.
revoke execute on function
  jobs_due(text),
  job_nightly(uuid),
  job_expiring_memberships(uuid),
  record_expiry_notification(uuid, email_status, text),
  start_backup_run(uuid),
  finish_backup_run(uuid, text, text, bigint, boolean, text),
  backup_tables(),
  backup_table_rows(uuid, text),
  shifts_pending_email()
  from public, anon, authenticated;
grant execute on function
  jobs_due(text),
  job_nightly(uuid),
  job_expiring_memberships(uuid),
  record_expiry_notification(uuid, email_status, text),
  start_backup_run(uuid),
  finish_backup_run(uuid, text, text, bigint, boolean, text),
  backup_tables(),
  backup_table_rows(uuid, text),
  shifts_pending_email()
  to service_role;
