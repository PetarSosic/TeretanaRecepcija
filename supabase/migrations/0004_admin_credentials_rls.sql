-- M-02b: the identity rule of D-57, the admin-only password store of D-59, and the
-- policy reach of D-58. Applied after 0003, which added the enum value.

-- D-57: identity no longer depends on the role. Every account has exactly one login
-- identity, a username or an email, and an admin must have an email so a forgotten
-- admin password can be reset.
alter table staff drop constraint staff_check;
alter table staff add constraint staff_one_identity
  check ((username is null) <> (email is null));
alter table staff add constraint staff_admin_has_email
  check (role <> 'admin' or email is not null);

-- D-59: the readable copy of each staff password, readable by the admin alone.
-- Deliberately NOT audited: audit_log is owner-readable, and an audit row would copy
-- these values into it (BR-096 covers staff, not this table).
create table staff_credentials (
  staff_id   uuid primary key references staff(id),
  gym_id     uuid not null references gyms(id),
  password   text not null,
  updated_at timestamptz not null default now()
);

alter table staff_credentials enable row level security;

create policy staff_credentials_select on staff_credentials
  for select to authenticated
  using (my_role() = 'admin' and gym_id = my_gym());

revoke all on staff_credentials from anon, authenticated;
grant select on staff_credentials to authenticated;

-- D-58: an admin reaches everything an owner reaches.
drop policy shifts_select on shifts;
create policy shifts_select on shifts
  for select to authenticated
  using (
    gym_id = my_gym()
    and (
      my_role() in ('owner', 'admin')
      or (my_role() = 'manager' and closed_at is null)
      or (my_role() = 'receptionist' and (closed_at is null or staff_id = (current_staff()).id))
    )
  );

drop policy audit_log_select on audit_log;
create policy audit_log_select on audit_log
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());

drop policy job_runs_select on job_runs;
create policy job_runs_select on job_runs
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());
