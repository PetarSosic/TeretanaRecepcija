-- D-90 (doc 07 §6): the row-level policies ask who the caller is once per statement
-- instead of once per row. my_gym(), my_role(), current_staff() and auth.uid() are the
-- same for every row of one statement, and wrapped in a sub-select Postgres evaluates
-- them once (Supabase's "auth_rls_initplan" advice). The rules themselves are unchanged:
-- every policy below allows exactly the rows it allowed before.
--
-- stock_movements_select compared each row's local date with today (one gym lookup per
-- row); it now compares created_at with today's first and next day's first instant, which
-- selects the same rows and can use an index.

/**
 * D-90: the first instant of `p_date` in the gym's time zone (BR-001), so a local-day
 * filter becomes `ts >= gym_day_start(g, from) and ts < gym_day_start(g, to + 1)`.
 * A daylight-saving change is handled by the time zone rules, not by adding 24 hours.
 */
create function gym_day_start(p_gym uuid, p_date date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (p_date::timestamp at time zone g.timezone) from gyms g where g.id = p_gym;
$$;

revoke execute on function gym_day_start(uuid, date) from public, anon;

alter policy audit_log_select on public.audit_log
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy backup_runs_select on public.backup_runs
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy card_batches_select on public.card_batches
  using (((gym_id = (select my_gym())) AND ((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role]))));

alter policy cards_select on public.cards
  using ((gym_id = (select my_gym())));

alter policy class_slots_select on public.class_slots
  using ((gym_id = (select my_gym())));

alter policy expense_categories_select on public.expense_categories
  using (((gym_id = (select my_gym())) AND (((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) OR (is_active AND (NOT is_salary)))));

alter policy expenses_select on public.expenses
  using (((gym_id = (select my_gym())) AND (((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) OR ((created_by = (select (current_staff()).id)) AND (spent_on = (select gym_today(my_gym())))))));

alter policy expiry_notifications_select on public.expiry_notifications
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy gym_settings_select on public.gym_settings
  using ((gym_id = (select my_gym())));

alter policy gyms_select on public.gyms
  using ((id = (select my_gym())));

alter policy job_runs_select on public.job_runs
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy members_select on public.members
  using ((gym_id = (select my_gym())));

alter policy membership_finance_select on public.membership_finance
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy memberships_select on public.memberships
  using ((gym_id = (select my_gym())));

alter policy payments_select on public.payments
  using (((gym_id = (select my_gym())) AND (((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) OR ((paid_on = (select gym_today(my_gym()))) AND (NOT is_backdated)))));

alter policy plan_finance_select on public.plan_finance
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy plans_select on public.plans
  using ((gym_id = (select my_gym())));

alter policy products_select on public.products
  using ((gym_id = (select my_gym())));

alter policy programs_select on public.programs
  using ((gym_id = (select my_gym())));

alter policy shifts_select on public.shifts
  using (((gym_id = (select my_gym())) AND (((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) OR (((select my_role()) = 'manager'::app_role) AND (closed_at IS NULL)) OR (((select my_role()) = 'receptionist'::app_role) AND ((closed_at IS NULL) OR (staff_id = (select (current_staff()).id)))))));

alter policy staff_select on public.staff
  using (CASE
      WHEN ((select my_role()) = 'receptionist'::app_role) THEN (user_id = (select auth.uid()))
      ELSE (gym_id = (select my_gym()))
  END);

alter policy staff_credentials_select on public.staff_credentials
  using ((((select my_role()) = 'admin'::app_role) AND (gym_id = (select my_gym()))));

alter policy stock_movements_select on public.stock_movements
  using (((gym_id = (select my_gym())) AND (((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) OR ((created_at >= (select gym_day_start(my_gym(), gym_today(my_gym())))) AND (created_at < (select gym_day_start(my_gym(), gym_today(my_gym()) + 1)))))));

alter policy trainer_finance_select on public.trainer_finance
  using ((((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (gym_id = (select my_gym()))));

alter policy trainer_programs_select on public.trainer_programs
  using ((gym_id = (select my_gym())));

alter policy trainers_select on public.trainers
  using ((gym_id = (select my_gym())));

alter policy visits_select on public.visits
  using ((gym_id = (select my_gym())));

alter policy gym_assets_read on storage.objects
  using (((bucket_id = 'gym-assets'::text) AND (((select my_gym()))::text = (storage.foldername(name))[1])));

alter policy shift_reports_read on storage.objects
  using (((bucket_id = 'shift-reports'::text) AND ((select my_role()) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])) AND (((select my_gym()))::text = (storage.foldername(name))[1])));

