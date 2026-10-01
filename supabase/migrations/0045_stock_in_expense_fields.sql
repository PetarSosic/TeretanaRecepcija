-- D-95: S-13 [Nova roba] takes the fields of the owner's expense form (BR-133) except
-- the category, which is always "Roba za prodaju": a description, the payment date, the
-- method, "Iz kase", the supplier, the invoice number and whether VAT is included. The
-- price stays per unit, as written on the invoice, and the total is quantity × price.
--
-- The date is the day the goods were paid for: it dates the expense (the cash flow,
-- BR-158) and nothing else; the stock rises now. Only the owner and the admin may give an
-- earlier day; for everyone else it is today. "Iz kase" works as on BR-133: today, cash,
-- the open shift. The new parameters come last with defaults, so a call with the first
-- four keeps its meaning: no method is "Van kase" (AS-17) and the description is
-- "Nabavka: <proizvod> × <količina>".

drop function stock_in(uuid, integer, numeric, boolean);

/**
 * BR-141 (any role): goods arrive. In one transaction the stock rises, the entered price
 * becomes the product's purchase price (AS-6), and the "Roba za prodaju" expense is
 * written with the BR-133 fields (D-95). D-55: a price below €0.01 is refused before
 * anything is written.
 */
create function stock_in(
  p_product     uuid,
  p_qty         integer,
  p_unit_cost   numeric,
  p_from_till   boolean,
  p_method      payment_method default null,
  p_spent_on    date default null,
  p_description text default null,
  p_supplier    text default null,
  p_invoice     text default null,
  p_vat         boolean default null
)
returns stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff       staff := current_staff();
  v_today       date := gym_today(v_staff.gym_id);
  v_spent       date := coalesce(p_spent_on, v_today);
  v_method      payment_method := p_method;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_supplier    text := nullif(btrim(coalesce(p_supplier, '')), '');
  v_invoice     text := nullif(btrim(coalesce(p_invoice, '')), '');
  v_shift       shifts;
  v_product     products;
  v_category    uuid;
  v_movement    stock_movements;
begin
  if p_unit_cost is null or p_unit_cost < 0.01 then
    raise exception 'E_STOCK_COST_INVALID';
  end if;
  if p_qty is null or p_qty not between 1 and 10000 or p_from_till is null
     or v_spent > v_today
     or (v_description is not null and char_length(v_description) not between 2 and 200)
     or char_length(coalesce(v_supplier, '')) > 100
     or char_length(coalesce(v_invoice, '')) > 50 then
    raise exception 'E_VALIDATION';
  end if;
  -- D-95: an earlier payment day is the owner's and the admin's, as on BR-133.
  if v_spent <> v_today and v_staff.role not in ('owner', 'admin') then
    raise exception 'E_FORBIDDEN';
  end if;

  select * into v_product from products
  where id = p_product and gym_id = v_staff.gym_id and is_active
  for update;
  if not found then
    raise exception 'E_VALIDATION';
  end if;

  -- BR-092 and BR-133: from the till is cash, today, on the open shift. Outside the till
  -- the goods are attached to the open shift when there is one, so the desk rules of
  -- AS-14 still apply to them.
  if p_from_till then
    v_spent := v_today;
    v_method := 'cash';
    v_shift := require_open_shift(v_staff.gym_id);
  else
    v_shift := open_shift(v_staff.gym_id);
  end if;

  select id into v_category from expense_categories
  where gym_id = v_staff.gym_id and is_system
  order by name limit 1;
  if v_category is null then
    raise exception 'E_CATEGORY_NOT_ALLOWED';
  end if;

  insert into stock_movements (gym_id, product_id, type, quantity, unit_cost,
                               paid_from_till, created_by, shift_id)
  values (v_staff.gym_id, p_product, 'in', p_qty, round(p_unit_cost, 2),
          p_from_till, v_staff.id, v_shift.id)
  returning * into v_movement;

  update products set current_purchase_price = round(p_unit_cost, 2) where id = p_product;

  -- An expense paid on an earlier day belongs to no shift: today's shift did not pay it.
  insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                        paid_from_till, supplier, invoice_number, vat_included,
                        stock_movement_id, created_by, shift_id)
  values (v_staff.gym_id, v_spent, v_category,
          coalesce(v_description, 'Nabavka: ' || v_product.name || ' × ' || p_qty),
          round(p_qty * round(p_unit_cost, 2), 2),
          v_method, p_from_till, v_supplier, v_invoice, p_vat,
          v_movement.id, v_staff.id,
          case when v_spent = v_today then v_shift.id end);

  return v_movement;
end;
$$;

-- Signed-in staff only; every role may receive goods (P-41).
revoke execute on function
  stock_in(uuid, integer, numeric, boolean, payment_method, date, text, text, text, boolean)
  from public, anon;
