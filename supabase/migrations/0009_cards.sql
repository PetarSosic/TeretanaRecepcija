-- M-04: printed member cards (F-03). Tables and RLS from doc 07 §3 and §6, the code
-- rules from BR-030 and the batch RPC from doc 07 §5.

create table card_batches (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id),
  quantity   smallint not null check (quantity between 1 and 100),  -- BR-036
  pdf_path   text,
  created_by uuid not null references staff(id),
  created_at timestamptz not null default now()
);

create table cards (
  id     uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  -- BR-030: exactly ten digits, first digit 1-9, unique across all gyms.
  code   char(10) not null unique check (code ~ '^[1-9][0-9]{9}$'),
  status card_status not null default 'unassigned',
  -- The members table arrives in M-06; its foreign key is added by that migration,
  -- because a card may exist long before any member holds it.
  member_id          uuid,
  batch_id           uuid not null references card_batches(id),
  assigned_at        timestamptz,
  deactivated_at     timestamptz,
  deactivated_reason text,
  -- BR-031: an unassigned card has no member, an assigned one always does.
  check ((status = 'unassigned') = (member_id is null))
);
-- BR-032: a member holds at most one active card.
create unique index cards_one_active_per_member on cards (member_id) where status = 'active';
create index cards_batch_idx on cards (batch_id);

/**
 * BR-030: a random ten-digit code whose first digit is 1-9.
 *
 * gen_random_bytes is used rather than random(), so codes are not predictable from
 * one another. Seven bytes are read as a non-negative 56-bit integer and folded into
 * the nine billion codes of the range; the bias that folding introduces is about one
 * part in ten million, far below anything that matters here.
 */
create function random_card_code()
returns char(10)
language sql
volatile
as $$
  select lpad(
    ((('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint
      % 9000000000) + 1000000000)::text,
    10, '0')::char(10);
$$;

/**
 * BR-036: owners and managers generate 1-100 unassigned cards in one batch.
 * Uniqueness is guaranteed by the unique index; a collision simply draws again.
 */
create function generate_card_batch(p_qty integer)
returns card_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_staff_role(array['owner', 'manager', 'admin']::app_role[]);
  v_batch    card_batches;
  v_made     integer := 0;
  v_attempts integer := 0;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100 then
    raise exception 'E_VALIDATION';
  end if;

  insert into card_batches (gym_id, quantity, created_by)
  values (v_staff.gym_id, p_qty, v_staff.id)
  returning * into v_batch;

  while v_made < p_qty loop
    v_attempts := v_attempts + 1;
    if v_attempts > p_qty * 50 then
      -- Unreachable in practice; fail loudly rather than loop forever.
      raise exception 'E_VALIDATION';
    end if;
    insert into cards (gym_id, code, batch_id)
    values (v_staff.gym_id, random_card_code(), v_batch.id)
    on conflict (code) do nothing;
    if found then v_made := v_made + 1; end if;
  end loop;

  return v_batch;
end;
$$;

-- Row level security (doc 07 §6) ------------------------------------------------
alter table card_batches enable row level security;
alter table cards        enable row level security;

-- Every role scans cards, so every role reads them.
create policy cards_select on cards
  for select to authenticated
  using (gym_id = my_gym());

-- Batches are a printing tool: owner, manager and admin only, never a receptionist.
create policy card_batches_select on card_batches
  for select to authenticated
  using (gym_id = my_gym() and my_role() in ('owner', 'manager', 'admin'));

revoke all on card_batches, cards from anon, authenticated;
grant select on card_batches, cards to authenticated;

revoke execute on function random_card_code() from public, anon, authenticated;
revoke execute on function generate_card_batch(integer) from public, anon;
