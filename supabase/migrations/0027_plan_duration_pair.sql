-- 0027: N-14 (SET-14, doc 07 §3). The plan check compared "both duration fields empty"
-- with the kind, so a gym plan with a unit but no number (or a number but no unit)
-- passed and was stored without a usable duration. A plan now has either both fields
-- or neither; together with the existing check, a day pass has neither and every other
-- kind has both. Approved by the gym owner on 23.09.2026. A read-only query before this
-- migration found no plan that breaks it, so no row needs fixing.

alter table plans
  add constraint plans_duration_pair
  check ((duration_value is null) = (duration_unit is null));
