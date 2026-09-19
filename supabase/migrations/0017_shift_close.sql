-- M-10: closing a shift and its report (F-16). The BR-115 totals, shift_summary with the
-- D-54 manager limits, close_shift (BR-114), the report data behind the BR-117 PDF, and
-- the private shift-reports bucket (doc 07 §6).

-- Storage -------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shift-reports', 'shift-reports', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Doc 07 §6: the owner (and admin, D-58) reads the reports of their gym; the files are
-- written by the report pipeline with the service role, so no write policy exists.
create policy shift_reports_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shift-reports'
    and my_role() in ('owner', 'admin')
    and my_gym()::text = (storage.foldername(name))[1]
  );

/**
 * BR-115: the four totals over the shift's non-voided records, plus the difference when
 * cash was counted. Back-dated records have no shift and never appear (BR-120).
 */
create function shift_totals(p_shift uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_counted  numeric(10,2);
  v_cash     numeric(10,2);
  v_card     numeric(10,2);
  v_till     numeric(10,2);
  v_expected numeric(10,2);
begin
  select counted_cash into v_counted from shifts where id = p_shift;

  select coalesce(sum(amount) filter (where method = 'cash'), 0),
         coalesce(sum(amount) filter (where method = 'card'), 0)
  into v_cash, v_card
  from payments where shift_id = p_shift and voided_at is null;

  select v_cash + coalesce(sum(quantity * unit_price) filter (where method = 'cash'), 0),
         v_card + coalesce(sum(quantity * unit_price) filter (where method = 'card'), 0)
  into v_cash, v_card
  from stock_movements where shift_id = p_shift and type = 'out' and voided_at is null;

  select coalesce(sum(amount), 0) into v_till
  from expenses where shift_id = p_shift and paid_from_till and voided_at is null;

  v_expected := v_cash - v_till;
  return json_build_object(
    'cash_income', v_cash,
    'card_income', v_card,
    'till_expenses', v_till,
    'expected_cash', v_expected,
    'counted_cash', v_counted,
    'difference', v_counted - v_expected      -- null when not counted (BR-115)
  );
end;
$$;

/**
 * BR-117: everything the shift report shows, for the S-14 review and the PDF. The list
 * of expenses can be narrowed to one person's (p_expenses_of), because a receptionist
 * sees only the expenses she entered herself (BR-134) even on her own shift's summary;
 * the totals always count them all.
 */
create function shift_report_json(p_shift uuid, p_expenses_of uuid default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift shifts;
  v_at    timestamptz;
begin
  select * into v_shift from shifts where id = p_shift;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  v_at := coalesce(v_shift.closed_at, now());

  return json_build_object(
    'shift', (
      select json_build_object(
        'id', v_shift.id,
        'gym_id', v_shift.gym_id,
        'gym_name', g.name,
        'staff_id', v_shift.staff_id,
        'staff_name', s.full_name,
        'started_at', v_shift.started_at,
        'closed_at', v_shift.closed_at,
        'close_type', v_shift.close_type,
        'closed_by_name', (select full_name from staff where id = v_shift.closed_by),
        'email_status', v_shift.email_status
      )
      from gyms g, staff s
      where g.id = v_shift.gym_id and s.id = v_shift.staff_id
    ),
    'totals', shift_totals(p_shift),
    'counts', json_build_object(
      'payments', (select count(*) from payments
                   where shift_id = p_shift and voided_at is null and kind <> 'day_pass'),
      'day_passes', (select coalesce(sum(quantity), 0) from payments
                     where shift_id = p_shift and voided_at is null and kind = 'day_pass'),
      'sales', (select count(*) from stock_movements
                where shift_id = p_shift and type = 'out' and voided_at is null),
      'voided', (select count(*) from payments where shift_id = p_shift and voided_at is not null)
              + (select count(*) from stock_movements
                 where shift_id = p_shift and type = 'out' and voided_at is not null)
              + (select count(*) from expenses
                 where shift_id = p_shift and paid_from_till and voided_at is not null)
    ),
    'payments', coalesce((
      select json_agg(json_build_object(
               'created_at', p.created_at,
               'member', case when m.id is not null
                              then '#' || m.member_number || ' ' || m.first_name || ' ' || m.last_name end,
               'kind', p.kind,
               'quantity', p.quantity,
               'plan', pl.name,
               'method', p.method,
               'amount', p.amount,
               'entered_by', st.full_name
             ) order by p.created_at)
      from payments p
      left join members m on m.id = p.member_id
      left join plans pl on pl.id = p.plan_id
      join staff st on st.id = p.created_by
      where p.shift_id = p_shift and p.voided_at is null
    ), '[]'::json),
    'day_passes', coalesce((
      select json_agg(json_build_object('method', method, 'quantity', quantity, 'total', total)
                      order by method)
      from (select method, sum(quantity) as quantity, sum(amount) as total
            from payments
            where shift_id = p_shift and voided_at is null and kind = 'day_pass'
            group by method) d
    ), '[]'::json),
    'card_replacements', (
      select json_build_object('count', count(*), 'total', coalesce(sum(amount), 0))
      from payments
      where shift_id = p_shift and voided_at is null and kind = 'card_replacement'
    ),
    'sales', coalesce((
      select json_agg(json_build_object(
               'created_at', sm.created_at,
               'product', pr.name,
               'quantity', sm.quantity,
               'method', sm.method,
               'amount', sm.quantity * sm.unit_price
             ) order by sm.created_at)
      from stock_movements sm join products pr on pr.id = sm.product_id
      where sm.shift_id = p_shift and sm.type = 'out' and sm.voided_at is null
    ), '[]'::json),
    'till_expenses', coalesce((
      select json_agg(json_build_object(
               'created_at', e.created_at,
               'category', c.name,
               'description', e.description,
               'amount', e.amount,
               'entered_by', st.full_name
             ) order by e.created_at)
      from expenses e
      join expense_categories c on c.id = e.category_id
      join staff st on st.id = e.created_by
      where e.shift_id = p_shift and e.paid_from_till and e.voided_at is null
        and (p_expenses_of is null or e.created_by = p_expenses_of)
    ), '[]'::json),
    'voided', coalesce((
      select json_agg(v order by v.created_at)
      from (
        select p.created_at, 'payment' as record,
               coalesce(pl.name, '') as description, p.amount, p.void_reason as reason,
               (select full_name from staff where id = p.voided_by) as voided_by
        from payments p left join plans pl on pl.id = p.plan_id
        where p.shift_id = p_shift and p.voided_at is not null
        union all
        select sm.created_at, 'sale', pr.name || ' × ' || sm.quantity,
               sm.quantity * sm.unit_price, sm.void_reason,
               (select full_name from staff where id = sm.voided_by)
        from stock_movements sm join products pr on pr.id = sm.product_id
        where sm.shift_id = p_shift and sm.type = 'out' and sm.voided_at is not null
        union all
        select e.created_at, 'expense', e.description, e.amount, e.void_reason,
               (select full_name from staff where id = e.voided_by)
        from expenses e
        where e.shift_id = p_shift and e.paid_from_till and e.voided_at is not null
          and (p_expenses_of is null or e.created_by = p_expenses_of)
      ) v
    ), '[]'::json),
    -- BR-117: the members still inside when the shift ended (or now, while it is open).
    'open_visits', (
      select count(*) from visits
      where gym_id = v_shift.gym_id
        and checked_in_at <= v_at
        and (checked_out_at is null or checked_out_at > v_at)
    )
  );
end;
$$;

/**
 * BR-115, D-54 and P-14. The owner (and admin) reads any shift of the gym in full; the
 * shift's receptionist reads her own, with only her own expenses listed (BR-134); a
 * manager gets the four totals of the shift open now and nothing else. Every other
 * request, a closed or foreign shift for a manager included, is E_FORBIDDEN.
 */
create function shift_summary(p_shift uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff  staff := current_staff();
  v_shift  shifts;
  v_totals json;
begin
  select * into v_shift from shifts where id = p_shift and gym_id = v_staff.gym_id;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  if v_staff.role in ('owner', 'admin') then
    return shift_report_json(p_shift);
  end if;
  if v_staff.role = 'receptionist' and v_shift.staff_id = v_staff.id then
    return shift_report_json(p_shift, v_staff.id);
  end if;
  if v_staff.role = 'manager' and v_shift.closed_at is null then
    v_totals := shift_totals(p_shift);
    return json_build_object(
      'cash_income', v_totals -> 'cash_income',
      'card_income', v_totals -> 'card_income',
      'till_expenses', v_totals -> 'till_expenses',
      'expected_cash', v_totals -> 'expected_cash'
    );
  end if;
  raise exception 'E_FORBIDDEN';
end;
$$;

/**
 * BR-114: the shift's receptionist closes it with the counted cash (required, ≥ 0); the
 * owner may close any open shift of the gym, with the cash optional. A shift closed in
 * the meantime (taken over, or closed at 23:00) can no longer be changed.
 */
create function close_shift(p_shift uuid, p_counted_cash numeric)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_shift shifts;
begin
  select * into v_shift from shifts
  where id = p_shift and gym_id = v_staff.gym_id
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_staff.role not in ('owner', 'admin')
     and not (v_staff.role = 'receptionist' and v_shift.staff_id = v_staff.id) then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_shift.closed_at is not null then
    raise exception 'E_RECORD_NOT_EDITABLE';
  end if;
  if (p_counted_cash is null and v_staff.role = 'receptionist') or p_counted_cash < 0 then
    raise exception 'E_VALIDATION';
  end if;

  update shifts
  set closed_at    = now(),
      close_type   = 'manual',
      closed_by    = v_staff.id,
      counted_cash = round(p_counted_cash, 2)
  where id = p_shift
  returning * into v_shift;
  return v_shift;
end;
$$;

/**
 * BR-117 and BR-118: the report pipeline (service role) records where the PDF is and
 * what happened to the email. Every real attempt counts towards the five of BR-118.
 */
create function record_shift_report(p_shift uuid, p_report_path text, p_status email_status)
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
      emailed_at     = case when p_status = 'sent' then now() else emailed_at end
  where id = p_shift
  returning * into v_shift;
  return v_shift;
end;
$$;

-- Function privileges -------------------------------------------------------------------
revoke execute on function
  shift_totals(uuid),
  shift_report_json(uuid, uuid),
  record_shift_report(uuid, text, email_status)
  from public, anon, authenticated;
grant execute on function
  shift_report_json(uuid, uuid),
  record_shift_report(uuid, text, email_status)
  to service_role;

revoke execute on function
  shift_summary(uuid),
  close_shift(uuid, numeric)
  from public, anon;
