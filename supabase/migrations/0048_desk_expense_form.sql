-- D-98: the desk's [Trošak] (S-11) opens the same form as the owner's [Novi trošak]
-- (S-17), so every role records an expense through record_expense (BR-132, BR-133).
-- record_desk_expense stays for the record, unused by the app.

/**
 * BR-133 (D-98): the expense form, for every role. Any date up to today, any active
 * category, any method including "Van kase", and the optional supplier, invoice and VAT
 * fields. Ticking "paid from till" pulls the record back into today's open shift, because
 * that is money that left the drawer.
 * D-92: not "Roba za prodaju" — goods come in through Nova roba (BR-141), or they would
 * be paid for without ever reaching the stock or its value.
 * D-37, D-80 and doc 04 §2: salaries, and so payouts, stay the owner's and the admin's.
 * A manager or receptionist needs an open shift and the record is attached to it, so they
 * can void it while it is open (BR-135, AS-14). The shift's cash (BR-115) still counts
 * only what is paid from the till.
 */
create or replace function record_expense(
  p_category    uuid,
  p_description text,
  p_amount      numeric,
  p_spent_on    date,
  p_method      payment_method default null,
  p_from_till   boolean default false,
  p_supplier    text default null,
  p_invoice     text default null,
  p_vat         boolean default null,
  p_trainer     uuid default null
)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := current_staff();
  v_owner    boolean := v_staff.role in ('owner', 'admin');
  v_today    date := gym_today(v_staff.gym_id);
  v_category expense_categories;
  v_shift    uuid;
  v_spent    date := p_spent_on;
  v_method   payment_method := p_method;
  v_expense  expenses;
begin
  select * into v_category from expense_categories
  where id = p_category and gym_id = v_staff.gym_id and is_active;
  if not found then
    raise exception 'E_VALIDATION';
  end if;
  if v_category.is_system or (v_category.is_salary and not v_owner) then
    raise exception 'E_CATEGORY_NOT_ALLOWED';
  end if;
  if char_length(coalesce(p_description, '')) not between 2 and 200
     or p_amount is null or p_amount < 0.01 or p_amount > 100000
     or v_spent is null or v_spent > v_today then
    raise exception 'E_VALIDATION';
  end if;
  -- BR-133: a trainer may be named only on a salary category, and must be this gym's.
  if p_trainer is not null then
    if not v_category.is_salary
       or not exists (select 1 from trainers where id = p_trainer and gym_id = v_staff.gym_id) then
      raise exception 'E_VALIDATION';
    end if;
  end if;

  if p_from_till then
    v_spent := v_today;
    v_method := 'cash';
  end if;
  if p_from_till or not v_owner then
    v_shift := (require_open_shift(v_staff.gym_id)).id;
  end if;

  insert into expenses (
    gym_id, spent_on, category_id, description, amount, method, paid_from_till,
    supplier, invoice_number, vat_included, trainer_id, created_by, shift_id
  ) values (
    v_staff.gym_id, v_spent, p_category, p_description, round(p_amount, 2), v_method,
    coalesce(p_from_till, false), nullif(p_supplier, ''), nullif(p_invoice, ''), p_vat,
    p_trainer, v_staff.id, v_shift
  )
  returning * into v_expense;
  return v_expense;
end;
$$;
