-- D-96: on S-12 Uplate danas a manager sees today's expenses as S-17 shows them (D-80):
-- every one but a salary, read-only. S-12 reads them through fin_expenses, and offers
-- [Poništi] only on the manager's own (BR-135), so the rows now carry who entered them.
-- Only the column created_by is added; the rows and who may ask are unchanged.

create or replace function fin_expenses(
  p_from       date,
  p_to         date,
  p_category   uuid default null,
  p_method     text default null,
  p_created_by uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_finance_period(p_from, p_to);
  v_manager boolean := v_staff.role = 'manager';
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.spent_on desc, t.created_at desc)
    from (
      select e.id,
             e.spent_on,
             c.name as category_name,
             c.is_salary,
             e.description,
             e.supplier,
             e.invoice_number,
             e.method,
             e.paid_from_till,
             e.vat_included,
             e.amount::text as amount,
             tr.full_name as trainer_name,
             e.created_by,
             s.full_name as created_by_name,
             e.stock_movement_id,
             e.recurring_expense_id,
             e.shift_id,
             e.created_at,
             e.voided_at,
             e.void_reason
      from expenses e
      join expense_categories c on c.id = e.category_id
      join staff s on s.id = e.created_by
      left join trainers tr on tr.id = e.trainer_id
      where e.gym_id = v_staff.gym_id
        and e.spent_on between p_from and p_to
        and (not v_manager or not c.is_salary)
        and (p_category is null or e.category_id = p_category)
        and (p_method is null
             or (p_method = 'none' and e.method is null)
             or e.method::text = p_method)
        and (p_created_by is null or e.created_by = p_created_by)
    ) t), '[]'::json);
end;
$$;
