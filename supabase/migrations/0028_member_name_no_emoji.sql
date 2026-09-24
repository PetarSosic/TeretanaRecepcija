-- 0028: N-16 (MEM-07). The shift report's font has no emoji, so a member saved as
-- "Ana😀" printed as "Ana " in the PDF. The owner decided on 24.09.2026 that a member's
-- first and last name may not contain emoji. The form refuses them with its own message
-- (features/members/schemas.ts, the same character ranges); clean_member() refuses them
-- here too, so no path around the form stores one. A read-only query before this
-- migration found no member with an emoji in the name, so no row needs fixing.

/**
 * Emoji and pictographs: the emoji blocks (U+1F000–U+1FAFF, flags included), the
 * symbol blocks that hold most of the older ones (U+2300–U+23FF, U+2600–U+27BF,
 * U+2B00–U+2BFF, 〰 〽 ㊗ ㊙), and the joiners and selectors that build them (U+FE0E,
 * U+FE0F, U+200D, U+20E3, tags). Letters of any script, digits, © and ® stay allowed.
 */
create function has_emoji(p_text text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_text, '') ~ '[\U0001F000-\U0001FAFF⌀-⏿☀-➿⬀-⯿〰〽㊗㊙︎️‍⃣\U000E0000-\U000E007F]';
$$;

revoke execute on function has_emoji(text) from public, anon, authenticated;

-- BR-040 and BR-041 as in 0012, plus N-16.
create or replace function clean_member(
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
     -- N-16: no emoji in a name; the shift report cannot print them.
     or has_emoji(v.first_name)
     or has_emoji(v.last_name)
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
