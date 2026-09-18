-- D-62: a trainer may carry their own group share percentage. Null means the plan's
-- percentage applies, which is how every seeded trainer starts.
alter table trainer_finance
  add column group_share_pct numeric(5,2) check (group_share_pct between 0 and 100);

/**
 * The single place that answers "what percentage does this trainer get on this plan".
 * BR-050 copies the answer onto the membership at sale, so a later change to either
 * the trainer or the plan never touches a membership already sold, and the sale and
 * the reports can never disagree about the rule.
 */
create function resolve_group_share(p_trainer uuid, p_plan uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tf.group_share_pct from trainer_finance tf where tf.trainer_id = p_trainer),
    (select pf.trainer_share_pct from plan_finance pf where pf.plan_id = p_plan)
  );
$$;

-- The fee RPC now sets both owner-only trainer values in one call (doc 07 §5).
drop function set_trainer_fee(uuid, numeric);

create function set_trainer_fee(
  p_trainer uuid,
  p_fee numeric,
  p_group_share_pct numeric
)
returns trainer_finance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_result trainer_finance;
begin
  -- BR-026: both values are the owner's, and both may be cleared back to "undefined".
  if p_fee is not null and p_fee < 0 then raise exception 'E_VALIDATION'; end if;
  if p_group_share_pct is not null
     and (p_group_share_pct < 0 or p_group_share_pct > 100) then
    raise exception 'E_VALIDATION';
  end if;

  update trainer_finance
  set personal_gym_fee = p_fee,
      group_share_pct  = p_group_share_pct
  where trainer_id = p_trainer and gym_id = v_staff.gym_id
  returning * into v_result;
  if not found then raise exception 'E_FORBIDDEN'; end if;
  return v_result;
end;
$$;

revoke execute on function
  resolve_group_share(uuid, uuid),
  set_trainer_fee(uuid, numeric, numeric)
  from public, anon;
