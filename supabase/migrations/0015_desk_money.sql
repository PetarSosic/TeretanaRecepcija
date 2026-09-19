-- M-08: money at the desk (F-12, F-13, F-14). The expenses table of doc 07 §3, day
-- passes (BR-100), payment corrections and voids (BR-094, BR-095, AS-14), and desk
-- expenses with their visibility and voids (BR-132, BR-134, BR-135).

create table expenses (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references gyms(id),
  spent_on          date not null,
  category_id       uuid not null references expense_categories(id),
  description       text not null check (char_length(description) between 2 and 200),
  amount            numeric(10,2) not null check (amount > 0 and amount <= 100000),
  method            payment_method,                    -- null = "Van kase" (AS-17)
  paid_from_till    boolean not null default false,
  supplier          text check (char_length(supplier) <= 100),
  invoice_number    text check (char_length(invoice_number) <= 50),
  vat_included      boolean,
  trainer_id        uuid references trainers(id),      -- payout (salary category only)
  -- stock_movements arrives in M-09, which adds this column's foreign key (as M-06
  -- did for cards.member_id).
  stock_movement_id uuid unique,
  created_by        uuid not null references staff(id),
  shift_id          uuid references shifts(id),
  created_at        timestamptz not null default now(),
  voided_at         timestamptz,
  voided_by         uuid references staff(id),
  void_reason       text,
  check (not paid_from_till or (method = 'cash' and shift_id is not null)),
  check ((voided_at is null) = (void_reason is null))
);
create index expenses_spent_idx on expenses (gym_id, spent_on);
-- Not in doc 07: the shift report (M-10) and the S-12 totals read one shift's records.
create index expenses_shift_idx on expenses (shift_id);

-- BR-096: expenses are audited on insert, update and void.
create trigger expenses_audit
  after insert or update on expenses
  for each row execute function audit_row();

alter table expenses enable row level security;

-- BR-134: a manager or receptionist sees only the expenses they entered today.
create policy expenses_select on expenses
  for select to authenticated
  using (
    gym_id = my_gym()
    and (
      my_role() in ('owner', 'admin')
      or (created_by = (current_staff()).id and spent_on = gym_today(my_gym()))
    )
  );

revoke all on expenses from anon, authenticated;
grant select on expenses to authenticated;

/**
 * BR-094, BR-095 and AS-14: who may change a record. The owner (and admin, D-58) may
 * change any; everyone else only a record attached to the shift that is open now, so
 * closed shift reports and back-dated entries never change behind the owner's back.
 */
create function record_editable(p_staff staff, p_shift uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_staff.role in ('owner', 'admin')
      or (p_shift is not null and p_shift = (open_shift(p_staff.gym_id)).id);
$$;

/** BR-095: a void reason is 3–200 characters, trimmed. */
create function void_reason_text(p_reason text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v) not between 3 and 200 then
    raise exception 'E_REASON_REQUIRED';
  end if;
  return v;
end;
$$;

-- Day passes (F-12) --------------------------------------------------------------------

/**
 * BR-100: 1–20 passes at the current day-pass price, no member and no visit, on the open
 * shift (BR-092). The price is read here, never taken from the screen (BR-004).
 */
create function sell_day_passes(p_qty integer, p_method payment_method)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_shift   shifts := require_open_shift(v_staff.gym_id);
  v_plan    plans;
  v_payment payments;
begin
  if p_qty is null or p_qty not between 1 and 20 or p_method is null then
    raise exception 'E_VALIDATION';
  end if;
  select * into v_plan from plans
  where gym_id = v_staff.gym_id and kind = 'day_pass' and is_active
  order by sort_order, name
  limit 1;
  if not found then
    raise exception 'E_VALIDATION';
  end if;

  insert into payments (gym_id, kind, plan_id, quantity, amount, method, paid_on,
                        created_by, shift_id)
  values (v_staff.gym_id, 'day_pass', v_plan.id, p_qty, round(p_qty * v_plan.price, 2),
          p_method, gym_today(v_staff.gym_id), v_staff.id, v_shift.id)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Corrections and voids (F-13) ------------------------------------------------------------

/**
 * BR-094: anyone may change the method and note of a payment on the open shift; only the
 * owner may change the amount, or touch a closed-shift or back-dated payment (AS-14). A
 * voided payment is history and no longer changes.
 */
create function correct_payment(
  p_payment uuid,
  p_method payment_method,
  p_note text,
  p_amount numeric default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_payment payments;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_payment from payments
  where id = p_payment and gym_id = v_staff.gym_id
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_payment.voided_at is not null or not record_editable(v_staff, v_payment.shift_id) then
    raise exception 'E_RECORD_NOT_EDITABLE';
  end if;
  if p_method is null or char_length(coalesce(v_note, '')) > 500 then
    raise exception 'E_VALIDATION';
  end if;
  if p_amount is not null and p_amount <> v_payment.amount then
    if v_staff.role not in ('owner', 'admin') then
      raise exception 'E_AMOUNT_LOCKED';
    end if;
    if p_amount < 0 then
      raise exception 'E_VALIDATION';
    end if;
  end if;

  update payments
  set method = p_method,
      note   = v_note,
      amount = coalesce(round(p_amount, 2), amount)
  where id = p_payment
  returning * into v_payment;
  return v_payment;
end;
$$;

/**
 * BR-095 and D-14: a void keeps the record, struck through and out of every total.
 * Voiding a membership payment also voids the membership, and the visits it covered
 * become unlinked unpaid visits again (E16). Voiding a card replacement fee does not bring
 * the old card back (BR-034).
 */
create function void_payment(p_payment uuid, p_reason text)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_payment payments;
  v_reason  text;
begin
  select * into v_payment from payments
  where id = p_payment and gym_id = v_staff.gym_id
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_payment.voided_at is not null or not record_editable(v_staff, v_payment.shift_id) then
    raise exception 'E_RECORD_NOT_EDITABLE';
  end if;
  v_reason := void_reason_text(p_reason);

  update payments
  set voided_at = now(), voided_by = v_staff.id, void_reason = v_reason
  where id = p_payment
  returning * into v_payment;

  if v_payment.kind = 'membership' then
    update memberships
    set voided_at = now(), voided_by = v_staff.id, void_reason = v_reason
    where id = v_payment.membership_id and voided_at is null;

    update visits
    set membership_id = null, is_unpaid = true
    where membership_id = v_payment.membership_id;
  end if;

  return v_payment;
end;
$$;

-- Desk expenses (F-14) ------------------------------------------------------------------

/**
 * BR-132: any role records a small expense paid in cash from the till, today, on the open
 * shift, in an active category that is not a salary category (D-37).
 */
create function record_desk_expense(p_category uuid, p_description text, p_amount numeric)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff       staff := current_staff();
  v_shift       shifts := require_open_shift(v_staff.gym_id);
  v_description text := btrim(coalesce(p_description, ''));
  v_expense     expenses;
begin
  if not exists (
    select 1 from expense_categories
    where id = p_category and gym_id = v_staff.gym_id and is_active and not is_salary
  ) then
    raise exception 'E_CATEGORY_NOT_ALLOWED';
  end if;
  if char_length(v_description) not between 2 and 200
     or p_amount is null or p_amount < 0.01 or p_amount > 10000 then
    raise exception 'E_VALIDATION';
  end if;

  insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                        paid_from_till, created_by, shift_id)
  values (v_staff.gym_id, gym_today(v_staff.gym_id), p_category, v_description,
          round(p_amount, 2), 'cash', true, v_staff.id, v_shift.id)
  returning * into v_expense;
  return v_expense;
end;
$$;

/**
 * BR-135 and AS-14: the owner voids any expense; others only their own, and only while
 * its shift is open. An automatic stock-in expense is voided with its stock-in (M-09),
 * never on its own, or the stock and the expense would disagree.
 */
create function void_expense(p_expense uuid, p_reason text)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_expense expenses;
  v_reason  text;
begin
  select * into v_expense from expenses
  where id = p_expense and gym_id = v_staff.gym_id
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_staff.role not in ('owner', 'admin') and v_expense.created_by <> v_staff.id then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_expense.voided_at is not null
     or v_expense.stock_movement_id is not null
     or not record_editable(v_staff, v_expense.shift_id) then
    raise exception 'E_RECORD_NOT_EDITABLE';
  end if;
  v_reason := void_reason_text(p_reason);

  update expenses
  set voided_at = now(), voided_by = v_staff.id, void_reason = v_reason
  where id = p_expense
  returning * into v_expense;
  return v_expense;
end;
$$;

-- Function privileges -------------------------------------------------------------------
revoke execute on function
  record_editable(staff, uuid),
  void_reason_text(text)
  from public, anon, authenticated;

revoke execute on function
  sell_day_passes(integer, payment_method),
  correct_payment(uuid, payment_method, text, numeric),
  void_payment(uuid, text),
  record_desk_expense(uuid, text, numeric),
  void_expense(uuid, text)
  from public, anon;
