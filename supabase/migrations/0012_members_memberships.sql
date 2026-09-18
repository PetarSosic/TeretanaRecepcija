-- M-06: members, memberships, payments and the visits table (doc 07 §3), the membership
-- helpers of doc 07 §4 and the member RPCs of doc 07 §5 (F-06 to F-09, F-11).
-- Visits get their table only: check-in and check-out are M-07.

-- Members ------------------------------------------------------------------------------
create table members (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  member_number  integer not null,                          -- BR-042
  first_name     text not null check (char_length(first_name) between 1 and 50),
  last_name      text not null check (char_length(last_name) between 1 and 50),
  phone          text check (phone ~ '^\+[0-9]{8,15}$'),     -- BR-041
  email          text check (email = lower(email) and char_length(email) <= 254),
  date_of_birth  date check (date_of_birth >= date '1900-01-01'),
  is_anonymized  boolean not null default false,
  anonymized_at  timestamptz,
  search_text    text not null default '',                  -- BR-044, maintained by trigger
  created_by     uuid not null references staff(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (gym_id, member_number),
  -- BR-040: every field is required until BR-046 anonymization clears them.
  check (is_anonymized or (phone is not null and email is not null and date_of_birth is not null))
);
create index members_phone_idx  on members (gym_id, phone);
create index members_email_idx  on members (gym_id, email);
create index members_search_idx on members using gin (search_text extensions.gin_trgm_ops);

-- BR-044: search ignores case and diacritics ("cosic" finds "Ćosić"), so the name is
-- stored folded once instead of being folded on every search.
create function members_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The dictionary is named because search_path is pinned to public.
  new.search_text := lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                                              new.first_name || ' ' || new.last_name));
  return new;
end;
$$;

create trigger members_search_text
  before insert or update of first_name, last_name on members
  for each row execute function members_search_text();

-- M-04 left this key for now: a card exists long before any member holds it.
alter table cards
  add constraint cards_member_id_fkey foreign key (member_id) references members(id);

-- Memberships ---------------------------------------------------------------------------
create table memberships (
  id                     uuid primary key default gen_random_uuid(),
  gym_id                 uuid not null references gyms(id),
  member_id              uuid not null references members(id),
  plan_id                uuid not null references plans(id),
  trainer_id             uuid references trainers(id),
  start_date             date not null,
  end_date               date not null,                    -- last valid day, inclusive (BR-051)
  start_reason           text not null,                    -- BR-052 reason text
  covers_gym             boolean not null,                 -- snapshots (BR-050)
  covers_group           boolean not null,
  covers_personal        boolean not null,
  gym_visit_limit        smallint,
  group_session_limit    smallint,
  personal_session_limit smallint check (personal_session_limit between 1 and 50),
  is_backdated           boolean not null default false,
  created_by             uuid not null references staff(id),
  shift_id               uuid references shifts(id),
  created_at             timestamptz not null default now(),
  voided_at              timestamptz,
  voided_by              uuid references staff(id),
  void_reason            text,
  check (end_date >= start_date),
  check (is_backdated = (shift_id is null)),
  check ((voided_at is null) = (void_reason is null))
);
create index memberships_member_idx on memberships (member_id, end_date desc);

create table membership_finance (                          -- OWNER ONLY, snapshot at sale
  membership_id     uuid primary key references memberships(id),
  gym_id            uuid not null references gyms(id),
  gym_fixed_amount  numeric(10,2) not null default 0,
  trainer_share_pct numeric(5,2),
  personal_gym_fee  numeric(10,2)                            -- null = nije definisano
);

-- Visits (table only; M-07 writes them) -------------------------------------------------
create table visits (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  member_id      uuid not null references members(id),
  membership_id  uuid references memberships(id),
  visit_type     visit_type not null,
  trainer_id     uuid references trainers(id),
  class_slot_id  uuid references class_slots(id),
  is_unpaid      boolean not null default false,
  is_manual      boolean not null default false,
  is_backdated   boolean not null default false,
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid not null references staff(id),
  checked_out_at timestamptz,
  checked_out_by uuid references staff(id),
  auto_checkout  boolean not null default false,
  shift_id       uuid references shifts(id),                -- open shift at check-in, may be null
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  check ((visit_type = 'gym') = (trainer_id is null)),
  check (visit_type = 'group' or class_slot_id is null)
  -- is_unpaid stays true after the visit is linked by a later sale (history, BR-052)
);
create unique index visits_one_open_per_member on visits (member_id) where checked_out_at is null;
create index visits_membership_idx on visits (membership_id, visit_type);
create index visits_checkin_idx    on visits (gym_id, checked_in_at);
-- Not in doc 07: the profile's visit history and BR-052's unpaid-visit lookup read one
-- member's visits newest first.
create index visits_member_idx     on visits (member_id, checked_in_at desc);

-- Money in ------------------------------------------------------------------------------
create table payments (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id),
  kind          payment_kind not null,
  membership_id uuid unique references memberships(id),
  member_id     uuid references members(id),
  plan_id       uuid references plans(id),
  quantity      smallint not null default 1 check (quantity between 1 and 20),
  amount        numeric(10,2) not null check (amount >= 0),
  method        payment_method not null,
  paid_on       date not null,
  note          text check (char_length(note) <= 500),
  is_backdated  boolean not null default false,
  created_by    uuid not null references staff(id),
  shift_id      uuid references shifts(id),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references staff(id),
  void_reason   text check (char_length(void_reason) between 3 and 200),
  check (is_backdated = (shift_id is null)),
  check ((kind = 'membership') = (membership_id is not null)),
  check (kind <> 'membership'       or (member_id is not null and plan_id is not null)),
  check (kind <> 'day_pass'         or (plan_id is not null and member_id is null)),
  check (kind <> 'card_replacement' or (member_id is not null and plan_id is null)),
  check ((voided_at is null) = (void_reason is null))
);
create index payments_shift_idx  on payments (shift_id);
create index payments_paid_idx   on payments (gym_id, paid_on);
-- Not in doc 07: the profile lists one member's payments (S-07).
create index payments_member_idx on payments (member_id);

-- Audit (BR-096): payments and memberships on insert, update and void; members on
-- update and anonymize only (doc 07 §3).
create trigger members_audit
  after update on members
  for each row execute function audit_row();
create trigger memberships_audit
  after insert or update on memberships
  for each row execute function audit_row();
create trigger payments_audit
  after insert or update on payments
  for each row execute function audit_row();

-- Helper functions (doc 07 §4) ------------------------------------------------------------
-- These read only tables every role may read in its own gym, so they run with the
-- caller's rights and RLS still applies when a screen calls them directly.

/** BR-051: the last valid day, inclusive. 31.01 + 1 month is 28.02 (E14). */
create function membership_end_date(p_start date, p_value int, p_unit duration_unit)
returns date
language sql
immutable
set search_path = public
as $$
  select case p_unit
    when 'day'   then p_start + p_value
    when 'month' then (p_start + make_interval(months => p_value))::date
  end;
$$;

/** BR-055: every linked visit of the type counts, a second one on the same day too. */
create function membership_used(p_membership uuid, p_type visit_type)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from visits v
  where v.membership_id = p_membership and v.visit_type = p_type;
$$;

/** BR-053: does membership M cover visit type T on date X. */
create function membership_covers(p_membership uuid, p_type visit_type, p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select m.voided_at is null
       and p_date between m.start_date and m.end_date
       and case p_type
             when 'gym'   then m.covers_gym
             when 'group' then m.covers_group
             else              m.covers_personal
           end
       -- A null limit means unlimited, which the null comparison turns into true.
       and coalesce(
             case p_type
               when 'gym'   then m.gym_visit_limit
               when 'group' then m.group_session_limit
               else              m.personal_session_limit
             end > membership_used(m.id, p_type),
             true)
    from memberships m
    where m.id = p_membership
  ), false);
$$;

/**
 * BR-054: the display status on a date. A G+T membership whose group sessions are gone
 * still covers the gym, so it stays 'active'.
 */
create function membership_status(p_membership uuid, p_date date)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when m.voided_at is not null then 'voided'
    when p_date < m.start_date   then 'upcoming'
    when p_date > m.end_date     then 'expired'
    when membership_covers(m.id, 'gym', p_date)
      or membership_covers(m.id, 'group', p_date)
      or membership_covers(m.id, 'personal', p_date) then 'active'
    else 'used_up'
  end
  from memberships m
  where m.id = p_membership;
$$;

/** BR-023: a trainer is selectable for a kind only through an active program of it. */
create function trainer_can(p_trainer uuid, p_kind program_kind)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from trainers t
    join trainer_programs tp on tp.trainer_id = t.id
    join programs p on p.id = tp.program_id
    where t.id = p_trainer and t.is_active and p.is_active and p.kind = p_kind
  );
$$;

/** BR-041: the normalized phone, or null when the input cannot be one. */
create function normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := regexp_replace(coalesce(p_phone, ''), '[[:space:]/()-]', '', 'g');
begin
  if v like '00%' then
    v := '+' || substr(v, 3);
  elsif v like '0%' then
    v := '+382' || substr(v, 2);         -- AS-1: no country code means Montenegro
  end if;
  return case when v ~ '^\+[0-9]{8,15}$' then v end;
end;
$$;

-- BR-052 -------------------------------------------------------------------------------------
create type membership_start as (
  start_date date,
  end_date   date,
  reason     text,
  visit_ids  uuid[],
  warning    text
);

/**
 * BR-052: where a new membership of this plan would start if sold on p_date (default:
 * gym today). Also answers which unpaid visits the sale would link and the E5 warning.
 *
 * "Comparable" means the two coverages share a visit type (D-16), and only unpaid visits
 * of a type the new plan covers are taken (D-17). With no comparable membership, every
 * unlinked unpaid visit of a covered type qualifies (AS-8).
 */
create function calc_membership_start(p_member uuid, p_plan uuid, p_date date default null)
returns membership_start
language plpgsql
stable
set search_path = public
as $$
declare
  v_member members;
  v_plan   plans;
  v_date   date;
  v_last   date;
  v_first  date;
  v_end    date;
  v_result membership_start;
begin
  select * into v_member from members where id = p_member;
  select * into v_plan from plans where id = p_plan and gym_id = v_member.gym_id;
  if v_member.id is null or v_plan.id is null or v_plan.kind = 'day_pass' then
    raise exception 'E_VALIDATION';
  end if;
  v_date := coalesce(p_date, gym_today(v_member.gym_id));

  -- L: the latest end among the member's non-voided comparable memberships.
  select max(m.end_date) into v_last
  from memberships m
  where m.member_id = p_member
    and m.voided_at is null
    and ((m.covers_gym and v_plan.covers_gym)
      or (m.covers_group and v_plan.covers_group)
      or (m.covers_personal and v_plan.covers_personal));

  -- Step 1: continue after the membership that still runs on D (E2).
  if v_last >= v_date then
    v_result.start_date := v_last + 1;
    v_result.reason := 'Nastavlja se na članarinu koja važi do ' || to_char(v_last, 'DD.MM.YYYY');
  else
    -- Step 2: start from the first unpaid visit after L, if the membership would still
    -- be valid on D when started there (E3); otherwise warn and fall through (E5, AS-9).
    select min(gym_local_date(v.gym_id, v.checked_in_at)) into v_first
    from visits v
    where v.member_id = p_member
      and v.is_unpaid and v.membership_id is null
      and ((v.visit_type = 'gym' and v_plan.covers_gym)
        or (v.visit_type = 'group' and v_plan.covers_group)
        or (v.visit_type = 'personal' and v_plan.covers_personal))
      and (v_last is null or gym_local_date(v.gym_id, v.checked_in_at) > v_last)
      and gym_local_date(v.gym_id, v.checked_in_at) <= v_date;

    if v_first is not null then
      v_end := membership_end_date(v_first, v_plan.duration_value, v_plan.duration_unit);
      if v_end >= v_date then
        v_result.start_date := v_first;
        v_result.reason := 'Počinje od prvog neplaćenog dolaska ' || to_char(v_first, 'DD.MM.YYYY');
        select array_agg(v.id order by v.checked_in_at) into v_result.visit_ids
        from visits v
        where v.member_id = p_member
          and v.is_unpaid and v.membership_id is null
          and ((v.visit_type = 'gym' and v_plan.covers_gym)
            or (v.visit_type = 'group' and v_plan.covers_group)
            or (v.visit_type = 'personal' and v_plan.covers_personal))
          and gym_local_date(v.gym_id, v.checked_in_at) between v_first and least(v_end, v_date);
      else
        v_result.warning := 'Neplaćeni dolasci su stariji od trajanja ove članarine i ostaju neplaćeni.';
      end if;
    end if;

    -- Step 3: start on D.
    if v_result.start_date is null then
      v_result.start_date := v_date;
      v_result.reason := 'Počinje danas';
    end if;
  end if;

  v_result.end_date := membership_end_date(v_result.start_date, v_plan.duration_value, v_plan.duration_unit);
  v_result.visit_ids := coalesce(v_result.visit_ids, '{}');
  return v_result;
end;
$$;

-- Internal building blocks of the RPCs (not callable by staff) ---------------------------

/**
 * BR-030, BR-031 and BR-070: the unassigned card with this code, locked for the caller's
 * transaction, or the coded error the scan table prescribes.
 */
create function unassigned_card(p_gym uuid, p_code text)
returns cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := btrim(coalesce(p_code, ''));
  v_card cards;
begin
  if v_code !~ '^[0-9]{10}$' then
    raise exception 'E_CARD_INVALID';
  end if;
  select * into v_card from cards where code = v_code and gym_id = p_gym for update;
  if not found then
    raise exception 'E_CARD_UNKNOWN';
  end if;
  if v_card.status = 'deactivated' then
    raise exception 'E_CARD_DEACTIVATED';
  end if;
  if v_card.status <> 'unassigned' then
    raise exception 'E_CARD_NOT_UNASSIGNED';
  end if;
  return v_card;
end;
$$;

/** BR-040 and BR-041: the member fields cleaned and checked, or E_VALIDATION. */
create function clean_member(
  p_gym uuid,
  p_first text,
  p_last text,
  p_phone text,
  p_email text,
  p_dob date
)
returns members
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v members;
begin
  v.first_name    := btrim(coalesce(p_first, ''));
  v.last_name     := btrim(coalesce(p_last, ''));
  v.phone         := normalize_phone(p_phone);
  v.email         := lower(btrim(coalesce(p_email, '')));
  v.date_of_birth := p_dob;
  if char_length(v.first_name) not between 1 and 50
     or char_length(v.last_name) not between 1 and 50
     or v.phone is null
     or char_length(v.email) > 254
     or v.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     -- AS-2: from 01.01.1900 to gym today, no minimum age.
     or v.date_of_birth is null
     or v.date_of_birth < date '1900-01-01'
     or v.date_of_birth > gym_today(p_gym) then
    raise exception 'E_VALIDATION';
  end if;
  return v;
end;
$$;

/**
 * The sale shared by sell_membership and register_member (BR-050 to BR-060). The caller
 * has already checked the shift (BR-092) and that the member belongs to its gym.
 */
create function membership_sale(
  p_staff staff,
  p_shift uuid,
  p_member uuid,
  p_plan uuid,
  p_trainer uuid,
  p_amount numeric,
  p_sessions integer,
  p_method payment_method,
  p_start_override date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner   boolean := p_staff.role in ('owner', 'admin');
  v_today      date := gym_today(p_staff.gym_id);
  v_plan       plans;
  v_finance    plan_finance;
  v_min        numeric(10,2);
  v_amount     numeric(10,2);
  v_trainer    uuid;
  v_calc       membership_start;
  v_visits     uuid[];
  v_membership memberships;
  v_payment    payments;
  v_linked     integer;
begin
  select * into v_plan from plans
  where id = p_plan and gym_id = p_staff.gym_id and is_active and kind <> 'day_pass';
  if not found or p_method is null then
    raise exception 'E_VALIDATION';
  end if;

  -- BR-058 and BR-023: a trainer where the plan needs one, from the right program kind.
  if v_plan.requires_trainer then
    if p_trainer is null then
      raise exception 'E_TRAINER_REQUIRED';
    end if;
    if not exists (select 1 from trainers where id = p_trainer and gym_id = p_staff.gym_id)
       or not trainer_can(
            p_trainer,
            case when v_plan.kind = 'personal' then 'personal' else 'group' end::program_kind
          ) then
      raise exception 'E_TRAINER_NOT_ASSIGNED';
    end if;
    v_trainer := p_trainer;
  end if;

  -- BR-059: the list price, which only the owner may change; Personalni is entered.
  if v_plan.kind = 'personal' then
    if p_amount is null or p_sessions is null or p_sessions not between 1 and 50 then
      raise exception 'E_VALIDATION';
    end if;
    select personal_min_price into v_min from gym_settings where gym_id = p_staff.gym_id;
    if p_amount < v_min then
      raise exception 'E_AMOUNT_BELOW_MIN';             -- E13
    end if;
    v_amount := round(p_amount, 2);
  elsif p_amount is null or p_amount = v_plan.price then
    v_amount := v_plan.price;
  elsif v_is_owner and p_amount >= 0 then
    v_amount := round(p_amount, 2);
  elsif v_is_owner then
    raise exception 'E_VALIDATION';
  else
    raise exception 'E_AMOUNT_LOCKED';
  end if;

  -- BR-052: the computed start, unless the owner overrides it (step 4).
  v_calc := calc_membership_start(p_member, p_plan, v_today);
  if p_start_override is not null and p_start_override <> v_calc.start_date then
    if not v_is_owner then
      raise exception 'E_FORBIDDEN';
    end if;
    v_calc.start_date := p_start_override;
    v_calc.end_date := membership_end_date(p_start_override, v_plan.duration_value, v_plan.duration_unit);
    v_calc.reason := 'Početak je odredio vlasnik.';
    -- The unpaid visits the chosen period covers, up to today.
    select coalesce(array_agg(v.id order by v.checked_in_at), '{}') into v_calc.visit_ids
    from visits v
    where v.member_id = p_member
      and v.is_unpaid and v.membership_id is null
      and ((v.visit_type = 'gym' and v_plan.covers_gym)
        or (v.visit_type = 'group' and v_plan.covers_group)
        or (v.visit_type = 'personal' and v_plan.covers_personal))
      and gym_local_date(v.gym_id, v.checked_in_at)
          between v_calc.start_date and least(v_calc.end_date, v_today);
  end if;

  -- BR-050: coverage, limits and the trainer are copied, never looked up again.
  insert into memberships (
    gym_id, member_id, plan_id, trainer_id, start_date, end_date, start_reason,
    covers_gym, covers_group, covers_personal,
    gym_visit_limit, group_session_limit, personal_session_limit,
    is_backdated, created_by, shift_id
  ) values (
    p_staff.gym_id, p_member, p_plan, v_trainer, v_calc.start_date, v_calc.end_date, v_calc.reason,
    v_plan.covers_gym, v_plan.covers_group, v_plan.covers_personal,
    v_plan.gym_visit_limit, v_plan.group_session_limit,
    case when v_plan.kind = 'personal' then p_sessions end,
    false, p_staff.id, p_shift
  )
  returning * into v_membership;

  -- BR-050 and D-62: the financial terms, frozen at sale in the owner-only table.
  select * into v_finance from plan_finance where plan_id = p_plan;
  insert into membership_finance (
    membership_id, gym_id, gym_fixed_amount, trainer_share_pct, personal_gym_fee
  ) values (
    v_membership.id,
    p_staff.gym_id,
    coalesce(v_finance.gym_fixed_amount, 0),
    case
      when v_plan.kind in ('group', 'combo') then resolve_group_share(v_trainer, p_plan)
      else v_finance.trainer_share_pct
    end,
    case
      when v_plan.kind = 'personal' then
        (select tf.personal_gym_fee from trainer_finance tf where tf.trainer_id = v_trainer)
    end
  );

  -- BR-060 and BR-093: exactly one payment for the full amount, paid today.
  insert into payments (
    gym_id, kind, membership_id, member_id, plan_id, amount, method, paid_on,
    created_by, shift_id
  ) values (
    p_staff.gym_id, 'membership', v_membership.id, p_member, p_plan, v_amount, p_method,
    v_today, p_staff.id, p_shift
  )
  returning * into v_payment;

  -- BR-052 step 2: the unpaid visits become this membership's, oldest first and no more
  -- than a limit allows, so BR-053 and BR-055 stay true for the membership afterwards.
  with ranked as (
    select v.id,
           v.visit_type,
           row_number() over (partition by v.visit_type order by v.checked_in_at) as position
    from visits v
    where v.id = any (v_calc.visit_ids) and v.membership_id is null
  )
  update visits v
  set membership_id = v_membership.id
  from ranked r
  where v.id = r.id
    and r.position <= coalesce(
      case r.visit_type
        when 'gym'   then v_membership.gym_visit_limit
        when 'group' then v_membership.group_session_limit
        else              v_membership.personal_session_limit
      end,
      2147483647);
  get diagnostics v_linked = row_count;

  return json_build_object(
    'membership_id', v_membership.id,
    'payment_id', v_payment.id,
    'start_date', v_membership.start_date,
    'end_date', v_membership.end_date,
    'reason', v_membership.start_reason,
    'warning', v_calc.warning,
    'amount', v_payment.amount,
    'linked_visits', v_linked
  );
end;
$$;

-- RPCs (doc 07 §5) ---------------------------------------------------------------------------

/** BR-092: the gym's open shift, which every non-back-dated money record needs. */
create function require_open_shift(p_gym uuid)
returns shifts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift shifts := open_shift(p_gym);
begin
  if v_shift.id is null then
    raise exception 'E_NO_OPEN_SHIFT';
  end if;
  return v_shift;
end;
$$;

/** US-06.1 AC4 and F-11 AC2: is this an unassigned card of my gym, before saving. */
create function check_unassigned_card(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
begin
  perform unassigned_card(v_staff.gym_id, p_code);
  return true;
end;
$$;

/**
 * F-06: the member, their card, the first membership and its payment, in one transaction
 * (US-06.1 AC2). BR-033: no member without an unassigned card. BR-042: the next number.
 *
 * p_check_in ("Prijavi odmah") needs the check-in of M-07; until that milestone replaces
 * this function the flag must be false, so it is never silently ignored.
 */
create function register_member(
  p_card_code text,
  p_first text,
  p_last text,
  p_phone text,
  p_email text,
  p_dob date,
  p_plan uuid,
  p_trainer uuid,
  p_amount numeric,
  p_sessions integer,
  p_method payment_method,
  p_check_in boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := current_staff();
  v_shift  shifts := require_open_shift(v_staff.gym_id);
  v_card   cards;
  v_fields members;
  v_number integer;
  v_member members;
  v_sale   json;
begin
  if coalesce(p_check_in, false) then
    raise exception 'E_VALIDATION';
  end if;

  v_card := unassigned_card(v_staff.gym_id, p_card_code);
  v_fields := clean_member(v_staff.gym_id, p_first, p_last, p_phone, p_email, p_dob);

  -- BR-042: sequential per gym, never reused; the row lock serialises registrations.
  insert into member_counters (gym_id, last_number) values (v_staff.gym_id, 1)
  on conflict (gym_id) do update set last_number = member_counters.last_number + 1
  returning last_number into v_number;

  insert into members (
    gym_id, member_number, first_name, last_name, phone, email, date_of_birth, created_by
  ) values (
    v_staff.gym_id, v_number, v_fields.first_name, v_fields.last_name, v_fields.phone,
    v_fields.email, v_fields.date_of_birth, v_staff.id
  )
  returning * into v_member;

  update cards
  set status = 'active', member_id = v_member.id, assigned_at = now()
  where id = v_card.id;

  v_sale := membership_sale(
    v_staff, v_shift.id, v_member.id, p_plan, p_trainer, p_amount, p_sessions, p_method, null
  );

  return json_build_object(
    'member_id', v_member.id,
    'member_number', v_member.member_number,
    'first_name', v_member.first_name,
    'last_name', v_member.last_name,
    'membership', v_sale
  );
end;
$$;

/** F-08: sell or renew (BR-050 to BR-060). p_start_override is the owner's (BR-052 step 4). */
create function sell_membership(
  p_member uuid,
  p_plan uuid,
  p_trainer uuid,
  p_amount numeric,
  p_sessions integer,
  p_method payment_method,
  p_start_override date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_shift shifts := require_open_shift(v_staff.gym_id);
begin
  -- The member row lock keeps two sales for one member from computing the same start.
  perform 1 from members
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  return membership_sale(
    v_staff, v_shift.id, p_member, p_plan, p_trainer, p_amount, p_sessions, p_method,
    p_start_override
  );
end;
$$;

/** BR-043 and AS-3: members sharing the phone or email; a warning only, never a block. */
create function find_duplicates(p_phone text, p_email text)
returns table (
  id uuid,
  member_number integer,
  first_name text,
  last_name text,
  phone text,
  email text
)
language sql
stable
set search_path = public
as $$
  select m.id, m.member_number, m.first_name, m.last_name, m.phone, m.email
  from members m
  where m.gym_id = my_gym()
    and not m.is_anonymized
    and (m.phone = normalize_phone(p_phone)
      or m.email = nullif(lower(btrim(coalesce(p_email, ''))), ''))
  order by m.member_number
  limit 5;
$$;

/** BR-045: any role edits the personal data; the audit trigger records it (BR-096). */
create function update_member(
  p_member uuid,
  p_first text,
  p_last text,
  p_phone text,
  p_email text,
  p_dob date
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := current_staff();
  v_fields members := clean_member(v_staff.gym_id, p_first, p_last, p_phone, p_email, p_dob);
  v_member members;
begin
  update members
  set first_name    = v_fields.first_name,
      last_name     = v_fields.last_name,
      phone         = v_fields.phone,
      email         = v_fields.email,
      date_of_birth = v_fields.date_of_birth,
      updated_at    = now()
  -- S-07: an anonymized profile is read-only.
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized
  returning * into v_member;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  return v_member;
end;
$$;

/** BR-046 and P-24: owner only, irreversible; memberships, payments and visits stay. */
create function anonymize_member(p_member uuid)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_member members;
begin
  update members
  set first_name    = 'Anonimizirani',
      last_name     = 'član #' || member_number,
      phone         = null,
      email         = null,
      date_of_birth = null,
      is_anonymized = true,
      anonymized_at = now(),
      updated_at    = now()
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized
  returning * into v_member;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  update cards
  set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'anonimizirano'
  where member_id = p_member and status = 'active';

  return v_member;
end;
$$;

/**
 * BR-034 (F-11), in one transaction: the fee at today's price, the old card deactivated
 * as lost, the new unassigned card assigned. Voiding the fee later (M-08) does not bring
 * the old card back.
 */
create function replace_card(p_member uuid, p_new_code text, p_method payment_method)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_shift   shifts := require_open_shift(v_staff.gym_id);
  v_card    cards;
  v_fee     numeric(10,2);
  v_payment payments;
begin
  if p_method is null then
    raise exception 'E_VALIDATION';
  end if;
  perform 1 from members
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  v_card := unassigned_card(v_staff.gym_id, p_new_code);
  select card_replacement_price into v_fee from gym_settings where gym_id = v_staff.gym_id;

  insert into payments (gym_id, kind, member_id, amount, method, paid_on, created_by, shift_id)
  values (v_staff.gym_id, 'card_replacement', p_member, v_fee, p_method,
          gym_today(v_staff.gym_id), v_staff.id, v_shift.id)
  returning * into v_payment;

  update cards
  set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'izgubljena'
  where member_id = p_member and status = 'active';

  update cards
  set status = 'active', member_id = p_member, assigned_at = now()
  where id = v_card.id;

  return json_build_object('payment_id', v_payment.id, 'amount', v_payment.amount,
                           'card_code', v_card.code);
end;
$$;

-- Read functions for the screens -------------------------------------------------------------

/**
 * S-06 and BR-044: number (exact), name (partial, case and diacritics ignored) and phone
 * digits (partial); anonymized members never appear. The status column is the member's
 * best BR-054 status today, and the filter keeps members with or without an Aktivna one.
 */
create function member_search(
  p_query text default '',
  p_filter text default 'all',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  member_number integer,
  first_name text,
  last_name text,
  phone text,
  status text,
  status_date date,
  last_visit date,
  total bigint
)
language sql
stable
set search_path = public
as $$
  with input as (
    select btrim(coalesce(p_query, '')) as q,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                                    btrim(coalesce(p_query, '')))) as folded,
           ltrim(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '0') as digits,
           gym_today(my_gym()) as today
  ),
  found as (
    select m.*
    from members m, input i
    where m.gym_id = my_gym()
      and not m.is_anonymized
      and (i.q = ''
        or (i.q ~ '^\d{1,9}$' and m.member_number = i.q::int)
        or m.search_text like '%' || i.folded || '%'
        -- "067 123" is typed without the country code, so its leading 0 is dropped.
        or (char_length(i.digits) >= 3
            and regexp_replace(m.phone, '\D', '', 'g') like '%' || i.digits || '%'))
  ),
  summary as (
    select f.id,
           s.status,
           s.status_date,
           (select gym_local_date(f.gym_id, max(v.checked_in_at))
            from visits v where v.member_id = f.id) as last_visit
    from found f
    cross join input i
    left join lateral (
      select st.status,
             case st.status
               when 'upcoming' then min(st.start_date)
               else max(st.end_date)
             end as status_date
      from (
        select ms.start_date, ms.end_date, membership_status(ms.id, i.today) as status
        from memberships ms
        where ms.member_id = f.id and ms.voided_at is null
      ) st
      group by st.status
      order by case st.status
        when 'active' then 1 when 'used_up' then 2 when 'upcoming' then 3 else 4 end
      limit 1
    ) s on true
  )
  select f.id, f.member_number, f.first_name, f.last_name, f.phone,
         s.status, s.status_date, s.last_visit,
         count(*) over () as total
  from found f
  join summary s on s.id = f.id, input i
  where p_filter = 'all'
     or (p_filter = 'active' and s.status = 'active')
     or (p_filter = 'inactive' and s.status is distinct from 'active')
  order by (i.q ~ '^\d{1,9}$' and f.member_number = i.q::int) desc,
           f.last_name, f.first_name, f.member_number
  limit greatest(least(coalesce(p_limit, 25), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

/** S-07 Članarine: every membership with its BR-054 status and BR-055 remaining sessions. */
create function member_memberships(p_member uuid)
returns table (
  id uuid,
  plan_id uuid,
  plan_name text,
  plan_kind plan_kind,
  plan_is_active boolean,
  trainer_id uuid,
  trainer_name text,
  start_date date,
  end_date date,
  start_reason text,
  status text,
  covers_gym boolean,
  covers_group boolean,
  covers_personal boolean,
  gym_visit_limit smallint,
  gym_used integer,
  group_session_limit smallint,
  group_used integer,
  personal_session_limit smallint,
  personal_used integer,
  is_backdated boolean,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select ms.id, ms.plan_id, p.name, p.kind, p.is_active, ms.trainer_id, t.full_name,
         ms.start_date, ms.end_date, ms.start_reason,
         membership_status(ms.id, gym_today(ms.gym_id)),
         ms.covers_gym, ms.covers_group, ms.covers_personal,
         ms.gym_visit_limit, membership_used(ms.id, 'gym'),
         ms.group_session_limit, membership_used(ms.id, 'group'),
         ms.personal_session_limit, membership_used(ms.id, 'personal'),
         ms.is_backdated, ms.created_at
  from memberships ms
  join plans p on p.id = ms.plan_id
  left join trainers t on t.id = ms.trainer_id
  where ms.member_id = p_member and ms.gym_id = my_gym()
  order by ms.end_date desc, ms.created_at desc;
$$;

/**
 * S-07 lists who entered each payment ("Unio/la"). Doc 07 §6 limits a receptionist to
 * their own staff row, so, as with open_shift_info (0011), only the names asked for are
 * returned, and only from the caller's gym.
 */
create function staff_names(p_ids uuid[])
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.full_name
  from staff s
  where s.gym_id = my_gym() and s.id = any (p_ids);
$$;

-- Row level security (doc 07 §6) ------------------------------------------------------------
alter table members            enable row level security;
alter table memberships        enable row level security;
alter table membership_finance enable row level security;
alter table visits             enable row level security;
alter table payments           enable row level security;

create policy members_select on members
  for select to authenticated using (gym_id = my_gym());
create policy memberships_select on memberships
  for select to authenticated using (gym_id = my_gym());
create policy visits_select on visits
  for select to authenticated using (gym_id = my_gym());

-- Doc 04 §2: the financial snapshot is the owner's (and the admin's, D-58).
create policy membership_finance_select on membership_finance
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());

-- P-29: managers and receptionists see today's payments that are not back-dated.
create policy payments_select on payments
  for select to authenticated
  using (
    gym_id = my_gym()
    and (
      my_role() in ('owner', 'admin')
      or (paid_on = gym_today(my_gym()) and not is_backdated)
    )
  );

revoke all on members, memberships, membership_finance, visits, payments
  from anon, authenticated;
grant select on members, memberships, membership_finance, visits, payments
  to authenticated;

-- Function privileges ----------------------------------------------------------------------
-- Internal: only other security definer functions call these.
revoke execute on function
  members_search_text(),
  unassigned_card(uuid, text),
  clean_member(uuid, text, text, text, text, date),
  membership_sale(staff, uuid, uuid, uuid, uuid, numeric, integer, payment_method, date),
  require_open_shift(uuid)
  from public, anon, authenticated;

-- Doc 04 §2: a manager or receptionist must never receive a share percentage. 0008 left
-- this callable by every signed-in user; the sale now reads it with definer rights, so
-- staff no longer need it at all.
revoke execute on function resolve_group_share(uuid, uuid) from authenticated;

-- Signed-in staff only; each RPC checks the role itself.
revoke execute on function
  membership_end_date(date, int, duration_unit),
  membership_used(uuid, visit_type),
  membership_covers(uuid, visit_type, date),
  membership_status(uuid, date),
  trainer_can(uuid, program_kind),
  normalize_phone(text),
  calc_membership_start(uuid, uuid, date),
  check_unassigned_card(text),
  register_member(text, text, text, text, text, date, uuid, uuid, numeric, integer,
                  payment_method, boolean),
  sell_membership(uuid, uuid, uuid, numeric, integer, payment_method, date),
  find_duplicates(text, text),
  update_member(uuid, text, text, text, text, date),
  anonymize_member(uuid),
  replace_card(uuid, text, payment_method),
  member_search(text, text, integer, integer),
  member_memberships(uuid),
  staff_names(uuid[])
  from public, anon;
