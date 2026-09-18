-- Seed (doc 07 §7) steps 1 to 7. Step 8, the owner Auth user, is scripts/seed-owner.ts.
-- Every statement is idempotent; this file is applied to the hosted project and must
-- never depend on a database reset (D-56). Re-running it changes nothing, and in
-- particular it never rewrites a price the owner has since edited (BR-004).

-- 1. Gym and its BR-012 settings defaults --------------------------------------
insert into gyms (name)
select 'KP Fitness'
where not exists (select 1 from gyms where name = 'KP Fitness');

insert into gym_settings (gym_id)
select id from gyms where name = 'KP Fitness'
on conflict (gym_id) do nothing;

do $seed$
declare
  v_gym uuid := (select id from gyms where name = 'KP Fitness');
  v_program uuid;
begin

  -- 2. Plans (BR-010), with their owner-only finance rows -----------------------
  -- sort_order follows the order of the BR-010 table.
  insert into plans (gym_id, name, kind, duration_value, duration_unit, price,
                     covers_gym, covers_group, covers_personal,
                     gym_visit_limit, group_session_limit, requires_trainer, sort_order)
  select v_gym, seed.name, seed.kind, seed.duration_value, seed.duration_unit, seed.price,
         seed.covers_gym, seed.covers_group, seed.covers_personal,
         seed.gym_visit_limit, seed.group_session_limit, seed.requires_trainer, seed.sort_order
  from (values
    ('Nedeljna',              'gym'::plan_kind,  7::smallint,  'day'::duration_unit,   39::numeric, true,  false, false, null::smallint, null::smallint, false,  1::smallint),
    ('Dvonedeljna',           'gym',            14::smallint,  'day',                  49,          true,  false, false, null,           null,           false,  2),
    ('Mjesečna',              'gym',             1::smallint,  'month',                79,          true,  false, false, null,           null,           false,  3),
    ('Mjesečna 12 termina',   'gym',             1::smallint,  'month',                59,          true,  false, false, 12::smallint,   null,           false,  4),
    ('Studentska mjesečna',   'gym',             1::smallint,  'month',                49,          true,  false, false, 15::smallint,   null,           false,  5),
    ('Tromjesečna',           'gym',             3::smallint,  'month',               200,          true,  false, false, null,           null,           false,  6),
    ('Šestomjesečna',         'gym',             6::smallint,  'month',               400,          true,  false, false, null,           null,           false,  7),
    ('Godišnja',              'gym',            12::smallint,  'month',               790,          true,  false, false, null,           null,           false,  8),
    ('Grupni (3x nedeljno)',  'group',           1::smallint,  'month',                69,          false, true,  false, null,           12::smallint,   true,   9),
    ('G+T (Grupni + Teretana)','combo',          1::smallint,  'month',                99,          true,  true,  false, null,           12::smallint,   true,  10),
    -- BR-010: the Personalni price and session count are entered at sale.
    ('Personalni',            'personal',        1::smallint,  'month',              null,          false, false, true,  null,           null,           true,  11),
    ('Dnevna karta',          'day_pass',     null::smallint,  null,                   10,          false, false, false, null,           null,           false, 12)
  ) as seed (name, kind, duration_value, duration_unit, price, covers_gym, covers_group,
             covers_personal, gym_visit_limit, group_session_limit, requires_trainer, sort_order)
  where not exists (
    select 1 from plans p where p.gym_id = v_gym and p.name = seed.name
  );

  -- BR-010: Grupni gives the trainer 70%; G+T gives the gym a fixed €50 and the
  -- trainer the rest; Personalni uses the trainer's own fee (BR-020), so its plan
  -- row carries no share.
  insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct)
  select p.id, v_gym,
         case p.name when 'G+T (Grupni + Teretana)' then 50 else 0 end,
         case p.name
           when 'Grupni (3x nedeljno)' then 70
           when 'G+T (Grupni + Teretana)' then 100
           else null
         end
  from plans p
  where p.gym_id = v_gym
    and not exists (select 1 from plan_finance f where f.plan_id = p.id);

  -- 3. Trainers (BR-020) --------------------------------------------------------
  insert into trainers (gym_id, full_name)
  select v_gym, seed.full_name
  from (values ('Milena'), ('Julija'), ('Tamara'), ('Tatjana')) as seed (full_name)
  where not exists (
    select 1 from trainers t where t.gym_id = v_gym and t.full_name = seed.full_name
  );

  -- OQ-1: Julija's arrangement is unknown, so her fee stays null ("nije definisano").
  insert into trainer_finance (trainer_id, gym_id, personal_gym_fee)
  select t.id, v_gym,
         case t.full_name when 'Tamara' then 80 when 'Tatjana' then 80 else null end
  from trainers t
  where t.gym_id = v_gym
    and not exists (select 1 from trainer_finance f where f.trainer_id = t.id);

  -- 4. Programs, assignments and slots (BR-021, BR-022) -------------------------
  insert into programs (gym_id, name, kind)
  select v_gym, seed.name, seed.kind
  from (values
    ('Grupni trening', 'group'::program_kind),
    ('Personalni trening', 'personal')
  ) as seed (name, kind)
  where not exists (
    select 1 from programs p where p.gym_id = v_gym and p.name = seed.name
  );

  insert into trainer_programs (gym_id, trainer_id, program_id)
  select v_gym, t.id, p.id
  from (values
    ('Milena',  'Grupni trening'),
    ('Julija',  'Grupni trening'),
    ('Tamara',  'Grupni trening'),
    ('Julija',  'Personalni trening'),
    ('Tamara',  'Personalni trening'),
    ('Tatjana', 'Personalni trening')
  ) as seed (trainer, program)
  join trainers t on t.gym_id = v_gym and t.full_name = seed.trainer
  join programs p on p.gym_id = v_gym and p.name = seed.program
  on conflict (trainer_id, program_id) do nothing;

  -- BR-022: all slots belong to "Grupni trening". ISO weekdays, 1 = Monday.
  select id into v_program from programs where gym_id = v_gym and name = 'Grupni trening';
  insert into class_slots (gym_id, program_id, trainer_id, weekday, starts_at)
  select v_gym, v_program, t.id, seed.weekday, seed.starts_at
  from (values
    ('Milena',  2::smallint, time '08:00'), ('Milena',  4::smallint, time '08:00'), ('Milena', 6::smallint, time '08:00'),
    ('Milena',  2::smallint, time '18:00'), ('Milena',  4::smallint, time '18:00'), ('Milena', 6::smallint, time '18:00'),
    ('Julija',  1::smallint, time '08:30'), ('Julija',  3::smallint, time '08:30'), ('Julija', 5::smallint, time '08:30'),
    ('Tamara',  1::smallint, time '19:00'), ('Tamara',  3::smallint, time '19:00'), ('Tamara', 5::smallint, time '19:00')
  ) as seed (trainer, weekday, starts_at)
  join trainers t on t.gym_id = v_gym and t.full_name = seed.trainer
  where not exists (
    select 1 from class_slots cs
    where cs.gym_id = v_gym and cs.program_id = v_program and cs.trainer_id = t.id
      and cs.weekday = seed.weekday and cs.starts_at = seed.starts_at
  );

  -- 5. Expense categories (BR-130) ----------------------------------------------
  insert into expense_categories (gym_id, name, is_salary, is_system)
  select v_gym, seed.name, seed.is_salary, seed.is_system
  from (values
    ('Kirija', false, false),
    ('Plate', true, false),
    ('Komunalije', false, false),
    ('Struja', false, false),
    ('Voda', false, false),
    ('Internet/telefon', false, false),
    ('Održavanje', false, false),
    ('Potrošni materijal', false, false),
    ('Marketing', false, false),
    ('Oprema', false, false),
    ('Roba za prodaju', false, true),
    ('Porezi i doprinosi', false, false),
    ('Bankarske naknade', false, false),
    ('Ostalo', false, false)
  ) as seed (name, is_salary, is_system)
  where not exists (
    select 1 from expense_categories c where c.gym_id = v_gym and c.name = seed.name
  );

  -- 6. Product (BR-140) ---------------------------------------------------------
  insert into products (gym_id, name, current_purchase_price, sale_price)
  select v_gym, 'Voda', 0.30, 1.50
  where not exists (
    select 1 from products p where p.gym_id = v_gym and p.name = 'Voda'
  );

  -- 7. Member numbering (BR-042) ------------------------------------------------
  insert into member_counters (gym_id) values (v_gym)
  on conflict (gym_id) do nothing;

end
$seed$;
