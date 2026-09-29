-- D-76: products are added and edited on S-13 Magacin by every role but the receptionist.
-- S-26 Proizvodi is gone; the manager now has the owner's product rights (P-42, BR-140).

-- BR-140: the owner, the admin and the manager add products and set both prices.
create or replace function upsert_product(
  p_id uuid,
  p_name text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_is_active boolean default true
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_staff_role(array['owner', 'admin', 'manager']::app_role[]);
  v_product products;
begin
  if char_length(btrim(p_name)) not between 2 and 50 then
    raise exception 'E_VALIDATION';
  end if;
  if p_sale_price is null or p_sale_price <= 0
     or p_purchase_price is null or p_purchase_price < 0 then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    insert into products (gym_id, name, current_purchase_price, sale_price, is_active)
    values (v_staff.gym_id, btrim(p_name), p_purchase_price, p_sale_price,
            coalesce(p_is_active, true))
    returning * into v_product;
  else
    update products
    set name                   = btrim(p_name),
        current_purchase_price = p_purchase_price,
        sale_price             = p_sale_price,
        is_active              = coalesce(p_is_active, is_active)
    where id = p_id and gym_id = v_staff.gym_id
    returning * into v_product;
    if not found then raise exception 'E_FORBIDDEN'; end if;
  end if;
  return v_product;
end;
$$;
