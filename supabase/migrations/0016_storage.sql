-- M-09: Magacin (F-15). The stock_movements table of doc 07 §3, stock-in and bar sales
-- (BR-141, BR-142), their corrections and voids (BR-094, BR-095, AS-15), and the stock
-- level every role may see without stock value or profit (BR-143, BR-144).

create table stock_movements (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  product_id     uuid not null references products(id),
  type           stock_move not null,
  quantity       integer not null check (quantity between 1 and 10000),
  unit_cost      numeric(10,2) not null check (unit_cost >= 0),   -- in: entered; out: snapshot
  unit_price     numeric(10,2) check (unit_price > 0),           -- out only
  method         payment_method,                                -- out: required
  paid_from_till boolean not null default false,                -- in only
  created_by     uuid not null references staff(id),
  shift_id       uuid references shifts(id),
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,
  voided_by      uuid references staff(id),
  void_reason    text,
  check ((type = 'out') = (unit_price is not null and method is not null)),
  check (type <> 'in' or unit_cost > 0),                     -- BR-141, D-55: no free deliveries
  check (type = 'in' or not paid_from_till),
  check (type = 'in' or shift_id is not null),
  check (not paid_from_till or shift_id is not null),
  check ((voided_at is null) = (void_reason is null))
);
-- Not in doc 07: the stock level sums one product's movements; the shift report (M-10)
-- reads one shift's sales.
create index stock_movements_product_idx on stock_movements (product_id);
create index stock_movements_shift_idx   on stock_movements (shift_id);

-- M-08 created expenses.stock_movement_id without its key, because this table did not
-- exist yet.
alter table expenses
  add constraint expenses_stock_movement_id_fkey
  foreign key (stock_movement_id) references stock_movements(id);

-- BR-096: stock movements are audited on insert, update and void.
create trigger stock_movements_audit
  after insert or update on stock_movements
  for each row execute function audit_row();

alter table stock_movements enable row level security;

-- Doc 07 §6 and BR-144: the owner sees all movements; everyone else only today's, so no
-- sales history or totals beyond today reach them.
create policy stock_movements_select on stock_movements
  for select to authenticated
  using (
    gym_id = my_gym()
    and (
      my_role() in ('owner', 'admin')
      or gym_local_date(gym_id, created_at) = gym_today(gym_id)
    )
  );

revoke all on stock_movements from anon, authenticated;
grant select on stock_movements to authenticated;

/** BR-143: stock-in minus sales, voided movements excluded. There is no opening stock. */
create function product_stock(p_product uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when m.type = 'in' then m.quantity else -m.quantity end), 0)::int
  from stock_movements m
  where m.product_id = p_product and m.voided_at is null;
$$;

/**
 * S-13 and BR-144: the active products with their stock level and both prices, which
 * every role may see. Deliberately nothing else: no stock value and no profit, which are
 * the owner's (S-20, M-12).
 */
create function storage_products()
returns table (
  id uuid,
  name text,
  stock integer,
  current_purchase_price numeric,
  sale_price numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, product_stock(p.id), p.current_purchase_price, p.sale_price
  from products p
  where p.gym_id = my_gym() and p.is_active
  order by p.name;
$$;

/**
 * BR-141 (any role): goods arrive. In one transaction the stock rises, the entered price
 * becomes the product's purchase price (AS-6), and the "Roba za prodaju" expense is
 * written: from the till (cash, open shift required) or outside it (AS-17, method null).
 * D-55: a price below €0.01 is refused before anything is written.
 */
create function stock_in(
  p_product uuid,
  p_qty integer,
  p_unit_cost numeric,
  p_from_till boolean
)
returns stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := current_staff();
  v_shift    shifts;
  v_product  products;
  v_category uuid;
  v_movement stock_movements;
begin
  if p_unit_cost is null or p_unit_cost < 0.01 then
    raise exception 'E_STOCK_COST_INVALID';
  end if;
  if p_qty is null or p_qty not between 1 and 10000 or p_from_till is null then
    raise exception 'E_VALIDATION';
  end if;

  select * into v_product from products
  where id = p_product and gym_id = v_staff.gym_id and is_active
  for update;
  if not found then
    raise exception 'E_VALIDATION';
  end if;

  -- BR-092: paid from the till needs the open shift; outside the till it is attached to
  -- the open shift when there is one, so the desk rules of AS-14 still apply to it.
  v_shift := case when p_from_till then require_open_shift(v_staff.gym_id)
                  else open_shift(v_staff.gym_id) end;

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

  insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                        paid_from_till, stock_movement_id, created_by, shift_id)
  values (v_staff.gym_id, gym_today(v_staff.gym_id), v_category,
          'Nabavka: ' || v_product.name || ' × ' || p_qty,
          round(p_qty * round(p_unit_cost, 2), 2),
          case when p_from_till then 'cash'::payment_method end,
          p_from_till, v_movement.id, v_staff.id, v_shift.id);

  return v_movement;
end;
$$;

/**
 * BR-142 (any role): a bar sale at the product's sale price, with today's purchase price
 * as its cost, on the open shift. More than the stock is refused (E17); the stock level
 * travels in the error detail so the message can name it.
 */
create function stock_sale(p_product uuid, p_qty integer, p_method payment_method)
returns stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := current_staff();
  v_shift    shifts := require_open_shift(v_staff.gym_id);
  v_product  products;
  v_stock    integer;
  v_movement stock_movements;
begin
  if p_qty is null or p_qty not between 1 and 10000 or p_method is null then
    raise exception 'E_VALIDATION';
  end if;
  -- The product row lock serialises sales, so two desks cannot sell the last bottle twice.
  select * into v_product from products
  where id = p_product and gym_id = v_staff.gym_id and is_active
  for update;
  if not found then
    raise exception 'E_VALIDATION';
  end if;

  v_stock := product_stock(p_product);
  if p_qty > v_stock then
    raise exception 'E_STOCK_INSUFFICIENT' using detail = v_stock::text;
  end if;

  insert into stock_movements (gym_id, product_id, type, quantity, unit_cost, unit_price,
                               method, created_by, shift_id)
  values (v_staff.gym_id, p_product, 'out', p_qty, v_product.current_purchase_price,
          v_product.sale_price, p_method, v_staff.id, v_shift.id)
  returning * into v_movement;
  return v_movement;
end;
$$;

/** BR-094: the method of a sale, on the open shift (anyone) or any sale (the owner). */
create function correct_sale(p_movement uuid, p_method payment_method)
returns stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := current_staff();
  v_movement stock_movements;
begin
  select * into v_movement from stock_movements
  where id = p_movement and gym_id = v_staff.gym_id and type = 'out'
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_movement.voided_at is not null or not record_editable(v_staff, v_movement.shift_id) then
    raise exception 'E_RECORD_NOT_EDITABLE';
  end if;
  if p_method is null then
    raise exception 'E_VALIDATION';
  end if;

  update stock_movements set method = p_method where id = p_movement
  returning * into v_movement;
  return v_movement;
end;
$$;

/**
 * BR-095 and AS-15. A sale is voided like a payment (BR-094 permissions) and its quantity
 * returns to stock. A stock-in is the owner's to void (P-43): its automatic expense is
 * voided with it, and the void is refused when the goods are already sold, because the
 * stock would go negative.
 */
create function void_stock_movement(p_movement uuid, p_reason text)
returns stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := current_staff();
  v_movement stock_movements;
  v_reason   text;
begin
  select * into v_movement from stock_movements
  where id = p_movement and gym_id = v_staff.gym_id
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_movement.type = 'in' and v_staff.role not in ('owner', 'admin') then
    raise exception 'E_FORBIDDEN';
  end if;
  if v_movement.voided_at is not null or not record_editable(v_staff, v_movement.shift_id) then
    raise exception 'E_RECORD_NOT_EDITABLE';
  end if;
  v_reason := void_reason_text(p_reason);

  if v_movement.type = 'in' then
    perform 1 from products where id = v_movement.product_id for update;
    if product_stock(v_movement.product_id) - v_movement.quantity < 0 then
      raise exception 'E_STOCK_NEGATIVE';
    end if;
    update expenses
    set voided_at = now(), voided_by = v_staff.id, void_reason = v_reason
    where stock_movement_id = p_movement and voided_at is null;
  end if;

  update stock_movements
  set voided_at = now(), voided_by = v_staff.id, void_reason = v_reason
  where id = p_movement
  returning * into v_movement;
  return v_movement;
end;
$$;

-- Function privileges -------------------------------------------------------------------
revoke execute on function product_stock(uuid) from public, anon, authenticated;

revoke execute on function
  storage_products(),
  stock_in(uuid, integer, numeric, boolean),
  stock_sale(uuid, integer, payment_method),
  correct_sale(uuid, payment_method),
  void_stock_movement(uuid, text)
  from public, anon;
