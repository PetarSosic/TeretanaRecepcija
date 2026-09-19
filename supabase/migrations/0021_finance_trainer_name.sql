-- M-12: `trainers` names its column `full_name`, not `name` (migration 0005). Two of the
-- finance functions of 0020 read it as `name`, which PL/pgSQL only discovers when the
-- function runs. Both are replaced here with the column the table actually has.

/** US-18.1 and S-17: every expense of the period, with the filters the screen offers. */
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
  v_staff staff := assert_owner();
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
             e.amount,
             tr.full_name as trainer_name,
             s.full_name as created_by_name,
             e.stock_movement_id,
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
        and (p_category is null or e.category_id = p_category)
        -- 'none' is the only value that is not a payment method: it means "Van kase".
        and (p_method is null
             or (p_method = 'none' and e.method is null)
             or e.method::text = p_method)
        and (p_created_by is null or e.created_by = p_created_by)
    ) t), '[]'::json);
end;
$$;

/**
 * BR-156: one row per trainer for a month. "Klijenti" counts people, not payments, and
 * "Održani grupni treninzi" counts (date, slot) pairs, so two members at the same class
 * are one session. Shares that are "nije definisano" are counted in the revenue and left
 * out of both share totals, which is what makes E12 work.
 */
create or replace function fin_trainer_stats(p_month date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
  v_from  date := date_trunc('month', p_month)::date;
  v_to    date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.trainer_name)
    from (
      select tr.id as trainer_id,
             tr.full_name as trainer_name,
             tr.is_active,
             -- BR-154: a membership payment belongs to the membership's trainer.
             (select count(distinct m.member_id)::int
              from payments pay
              join memberships m on m.id = pay.membership_id
              where pay.gym_id = v_staff.gym_id and pay.voided_at is null
                and pay.paid_on between v_from and v_to
                and m.trainer_id = tr.id) as clients,
             (select count(*)::int from (
                select distinct gym_local_date(v.gym_id, v.checked_in_at), v.class_slot_id
                from visits v
                where v.gym_id = v_staff.gym_id and v.visit_type = 'group'
                  and v.trainer_id = tr.id
                  and gym_local_date(v.gym_id, v.checked_in_at) between v_from and v_to
              ) sessions) as group_sessions,
             (select count(*)::int from visits v
              where v.gym_id = v_staff.gym_id and v.visit_type = 'personal'
                and v.trainer_id = tr.id
                and gym_local_date(v.gym_id, v.checked_in_at) between v_from and v_to
             ) as personal_sessions,
             coalesce(revenue.total, 0) as revenue,
             coalesce(revenue.trainer_total, 0) as trainer_total,
             coalesce(revenue.gym_total, 0) as gym_total,
             coalesce(revenue.undefined_count, 0) as undefined_count,
             coalesce(paid.total, 0) as paid_out,
             coalesce(revenue.trainer_total, 0) - coalesce(paid.total, 0) as difference
      from trainers tr
      left join lateral (
        select sum(pay.amount) as total,
               sum(case when (share).is_defined then (share).trainer_share end) as trainer_total,
               sum(case when (share).is_defined then (share).gym_share end) as gym_total,
               count(*) filter (where not (share).is_defined)::int as undefined_count
        from (
          select pay.amount, membership_shares(m.id, pay.amount) as share
          from payments pay
          join memberships m on m.id = pay.membership_id
          where pay.gym_id = v_staff.gym_id and pay.voided_at is null
            and pay.paid_on between v_from and v_to
            and m.trainer_id = tr.id
        ) pay
      ) revenue on true
      left join lateral (
        select sum(e.amount) as total
        from expenses e join expense_categories c on c.id = e.category_id
        where e.gym_id = v_staff.gym_id and e.voided_at is null
          and e.trainer_id = tr.id and c.is_salary
          and e.spent_on between v_from and v_to
      ) paid on true
      where tr.gym_id = v_staff.gym_id
    ) t), '[]'::json);
end;
$$;
