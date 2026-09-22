-- 0026: N-02 (SEC-02). member_search passed the typed text straight into LIKE, so "%"
-- or "_" on its own listed every member of the gym, and any name containing one of them
-- could not be found. BR-044 describes a partial match on the characters that were
-- typed, so both wildcards are now matched literally. Nothing else in the function
-- changes, and "create or replace" keeps the grants of migration 0012.

create or replace function member_search(
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
        -- N-02: what was typed is a literal substring (BR-044), so the two LIKE
        -- wildcards and the escape character itself are escaped before matching.
        or m.search_text like '%' ||
             replace(replace(replace(i.folded, '\', '\\'),
                             '%', '\%'),
                     '_', '\_')
             || '%' escape '\'
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
