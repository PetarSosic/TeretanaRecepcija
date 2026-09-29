-- D-75: at most 5 failed sign-ins in a row for one login, then that login is locked for
-- 15 minutes; and at most 30 failed sign-ins in 15 minutes from one client address
-- (US-01.1 AC6, AC7). The owner and the admin may lift a lock early from S-23 (P-08).

-- The counters are not the gym's data: they belong to no gym, are kept out of the weekly
-- backup, which exports `public` gym by gym (BR-163), and out of the Data API, which
-- serves `public` alone. Only the security-definer functions below touch them.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.login_throttle (
  key          text primary key,                  -- 'login:<auth email>' or 'ip:<address>'
  attempts     smallint not null default 0,       -- in this window, successes taken back
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
alter table private.login_throttle enable row level security;  -- and no policy

/**
 * D-75: before a sign-in is tried. Refuses while the login or the client address is
 * locked, or already has as many attempts under way as it may fail; otherwise counts the
 * attempt on both. Counting before the password is checked keeps a burst of parallel
 * tries from slipping past the limit; login_attempt_end takes a success back.
 * A window lasts 15 minutes from its first attempt, and a lock that ran out starts a new
 * one. The answer is `{allowed}` or `{allowed: false, minutes}`.
 */
create function login_attempt_begin(p_email text, p_ip text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys  text[] := array['login:' || lower(btrim(coalesce(p_email, '')))];
  v_key   text;
  v_limit smallint;
  v_row   private.login_throttle;
  v_until timestamptz;
begin
  if nullif(btrim(p_ip), '') is not null then
    v_keys := v_keys || ('ip:' || btrim(p_ip));
  end if;

  foreach v_key in array v_keys loop
    v_limit := case when v_key like 'login:%' then 5 else 30 end;
    insert into private.login_throttle (key) values (v_key) on conflict (key) do nothing;
    select * into v_row from private.login_throttle where key = v_key for update;
    if v_row.locked_until > now() then
      v_until := greatest(v_until, v_row.locked_until);
    elsif v_row.locked_until is null
          and v_row.window_start > now() - interval '15 minutes'
          and v_row.attempts >= v_limit then
      v_until := greatest(v_until, now() + interval '15 minutes');
    end if;
  end loop;
  if v_until is not null then
    return json_build_object(
      'allowed', false,
      'minutes', ceil(extract(epoch from v_until - now()) / 60)::int
    );
  end if;

  update private.login_throttle
  set attempts     = case when window_start <= now() - interval '15 minutes'
                            or locked_until is not null then 1 else attempts + 1 end,
      window_start = case when window_start <= now() - interval '15 minutes'
                            or locked_until is not null then now() else window_start end,
      locked_until = null
  where key = any (v_keys);
  return json_build_object('allowed', true);
end;
$$;

/**
 * D-75: after the sign-in. A success clears the login's counter and takes the attempt
 * back from the address. A failure that reaches the limit locks for 15 minutes; a lock of
 * a staff login is written to Dnevnik izmjena (BR-096) as a change of that account, by
 * nobody, since no one is signed in.
 */
create function login_attempt_end(p_email text, p_ip text, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip    text := nullif(btrim(p_ip), '');
  v_until timestamptz;
  v_staff staff;
begin
  if p_ok then
    delete from private.login_throttle where key = 'login:' || v_email;
    update private.login_throttle
    set attempts = greatest(attempts - 1, 0)
    where key = 'ip:' || v_ip and locked_until is null;
    return;
  end if;

  update private.login_throttle
  set locked_until = now() + interval '15 minutes'
  where key = 'login:' || v_email and locked_until is null and attempts >= 5
  returning locked_until into v_until;
  if v_until is not null then
    select s.* into v_staff
    from staff s join auth.users u on u.id = s.user_id
    where lower(u.email) = v_email;
    if found then
      insert into audit_log (gym_id, table_name, row_id, action, old_data, new_data, changed_by)
      values (v_staff.gym_id, 'staff', v_staff.id::text, 'update',
              jsonb_build_object('full_name', v_staff.full_name, 'login_locked_until', null),
              jsonb_build_object('full_name', v_staff.full_name, 'login_locked_until', v_until),
              null);
    end if;
  end if;

  update private.login_throttle
  set locked_until = now() + interval '15 minutes'
  where key = 'ip:' || v_ip and locked_until is null and attempts >= 30;
end;
$$;

revoke execute on function
  login_attempt_begin(text, text),
  login_attempt_end(text, text, boolean)
  from public, anon, authenticated;
grant execute on function
  login_attempt_begin(text, text),
  login_attempt_end(text, text, boolean)
  to service_role;

/** S-23 and D-75: which accounts of the caller's gym are locked now, and until when. */
create function staff_login_locks()
returns table (staff_id uuid, locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller staff := current_staff();
begin
  -- P-04: S-23 belongs to the admin, the owner and the manager.
  if v_caller.role = 'receptionist' then
    raise exception 'E_FORBIDDEN';
  end if;
  return query
    select s.id, t.locked_until
    from staff s
    join auth.users u on u.id = s.user_id
    join private.login_throttle t on t.key = 'login:' || lower(u.email)
    where s.gym_id = v_caller.gym_id and t.locked_until > now();
end;
$$;

/**
 * P-08 (D-75): [Otključaj] on S-23 lifts a lock before its 15 minutes are up and clears
 * the login's failed attempts. The owner and the admin may do it; owner and admin
 * accounts are an admin's alone, as for every other change to them (P-03, D-58). An
 * account that is not locked is left as it is, so a second click changes nothing.
 */
create function unlock_staff_login(p_staff uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller staff := current_staff();
  v_target staff;
  v_until  timestamptz;
begin
  if v_caller.role not in ('owner', 'admin') then
    raise exception 'E_FORBIDDEN';
  end if;
  select * into v_target from staff where id = p_staff and gym_id = v_caller.gym_id;
  if not found
     or (v_target.role in ('owner', 'admin') and v_caller.role <> 'admin') then
    raise exception 'E_FORBIDDEN';
  end if;

  delete from private.login_throttle t
  using auth.users u
  where u.id = v_target.user_id and t.key = 'login:' || lower(u.email)
  returning t.locked_until into v_until;
  if v_until > now() then
    insert into audit_log (gym_id, table_name, row_id, action, old_data, new_data, changed_by)
    values (v_target.gym_id, 'staff', v_target.id::text, 'update',
            jsonb_build_object('full_name', v_target.full_name, 'login_locked_until', v_until),
            jsonb_build_object('full_name', v_target.full_name, 'login_locked_until', null),
            v_caller.id);
  end if;
end;
$$;

-- Signed-in staff only; each function checks the role itself.
revoke execute on function
  staff_login_locks(),
  unlock_staff_login(uuid)
  from public, anon;
