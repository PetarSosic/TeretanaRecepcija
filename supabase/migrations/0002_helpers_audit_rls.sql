-- M-01: helper functions (doc 07 §4), the audit trigger (BR-096) and the
-- SELECT policies of doc 07 §6 for the foundation tables.
--
-- Doc 04 §2: RLS is on for every table, `authenticated` gets SELECT only, and all
-- writes go through security definer RPCs. The helpers below are security definer
-- for two reasons: the policies on `staff` call them (an invoker-rights helper
-- would re-enter its own policy), and scheduled jobs must resolve a gym's date
-- without a staff session.

-- Helper functions (doc 07 §4) ------------------------------------------------
create function current_staff()
returns staff
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff;
begin
  select * into v_staff from staff where user_id = auth.uid() and is_active;
  if not found then
    raise exception 'E_NOT_STAFF';  -- doc 08 §5
  end if;
  return v_staff;
end;
$$;

create function my_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select (current_staff()).role;
$$;

create function my_gym()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (current_staff()).gym_id;
$$;

-- BR-001: "today" is the gym's local date, never the server date.
create function gym_today(p_gym uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone g.timezone)::date from gyms g where g.id = p_gym;
$$;

create function gym_local_date(p_gym uuid, p_ts timestamptz)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (p_ts at time zone g.timezone)::date from gyms g where g.id = p_gym;
$$;

-- BR-110: at most one open shift per gym, so this returns zero or one row.
create function open_shift(p_gym uuid)
returns shifts
language sql
stable
security definer
set search_path = public
as $$
  select s.* from shifts s where s.gym_id = p_gym and s.closed_at is null;
$$;

-- Audit trigger (BR-096) ------------------------------------------------------
-- Unlike current_staff() this never raises: system jobs write audited rows with
-- no staff session and are recorded with changed_by = null.
create function audit_actor()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from staff where user_id = auth.uid();
$$;

create function audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_new    jsonb := to_jsonb(new);
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif v_old ? 'voided_at'
    and v_old ->> 'voided_at' is null
    and v_new ->> 'voided_at' is not null then
    v_action := 'void';
  elsif v_old ? 'is_anonymized'
    and (v_old ->> 'is_anonymized')::boolean is false
    and (v_new ->> 'is_anonymized')::boolean then
    v_action := 'anonymize';
  else
    v_action := 'update';
  end if;

  insert into audit_log (gym_id, table_name, row_id, action, old_data, new_data, changed_by)
  values (
    coalesce(v_new ->> 'gym_id', v_old ->> 'gym_id')::uuid,
    tg_table_name,
    -- gym_settings is keyed by gym_id; every other audited table has an id.
    coalesce(v_new ->> 'id', v_new ->> 'gym_id'),
    v_action,
    v_old,
    v_new,
    audit_actor()
  );
  return null;
end;
$$;

create trigger staff_audit
  after insert or update on staff
  for each row execute function audit_row();

create trigger gym_settings_audit
  after insert or update on gym_settings
  for each row execute function audit_row();

-- Row level security (doc 07 §6) ----------------------------------------------
alter table gyms            enable row level security;
alter table gym_settings    enable row level security;
alter table staff           enable row level security;
alter table shifts          enable row level security;
alter table member_counters enable row level security;
alter table audit_log       enable row level security;
alter table job_runs        enable row level security;

create policy gyms_select on gyms
  for select to authenticated
  using (id = my_gym());

create policy gym_settings_select on gym_settings
  for select to authenticated
  using (gym_id = my_gym());

-- Owner and manager see their gym's staff; a receptionist sees only their own row.
create policy staff_select on staff
  for select to authenticated
  using (
    case
      when my_role() = 'receptionist' then user_id = auth.uid()
      else gym_id = my_gym()
    end
  );

-- Owner: every shift of the gym. Manager: the open shift only.
-- Receptionist: the open shift and their own shifts.
create policy shifts_select on shifts
  for select to authenticated
  using (
    gym_id = my_gym()
    and (
      my_role() = 'owner'
      or (my_role() = 'manager' and closed_at is null)
      or (my_role() = 'receptionist' and (closed_at is null or staff_id = (current_staff()).id))
    )
  );

create policy audit_log_select on audit_log
  for select to authenticated
  using (my_role() = 'owner' and gym_id = my_gym());

create policy job_runs_select on job_runs
  for select to authenticated
  using (my_role() = 'owner' and gym_id = my_gym());

-- member_counters is internal to register_member (BR-042): no policy, so no role
-- other than the security definer RPCs can read or write it.

-- Table privileges (doc 04 §2) ------------------------------------------------
-- Supabase grants all privileges on new public tables to anon and authenticated;
-- take them back so no direct write is possible even if a policy were added.
revoke all on gyms, gym_settings, staff, shifts, member_counters, audit_log, job_runs
  from anon, authenticated;
grant select on gyms, gym_settings, staff, shifts, audit_log, job_runs
  to authenticated;

revoke execute on function
  current_staff(), my_role(), my_gym(), gym_today(uuid), gym_local_date(uuid, timestamptz),
  open_shift(uuid), audit_actor(), audit_row()
  from public, anon, authenticated;
grant execute on function
  current_staff(), my_role(), my_gym(), gym_today(uuid), gym_local_date(uuid, timestamptz),
  open_shift(uuid)
  to authenticated;
