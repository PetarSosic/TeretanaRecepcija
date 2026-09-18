-- M-06 follow-up: BR-046 anonymization also removes the member's personal data from
-- the audit log. Doc 02 defines anonymization as irreversibly removing personal data
-- while keeping history; the audit rows of the members table would otherwise keep the
-- old name, phone, email and date of birth in old_data/new_data. The rows themselves
-- stay (who changed what, and when), only the personal values are replaced.

create or replace function anonymize_member(p_member uuid)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_member members;
  v_scrub  jsonb;
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

  -- The anonymize audit row was written by the trigger during the update above, so it
  -- is scrubbed here too.
  v_scrub := jsonb_build_object(
    'first_name', v_member.first_name,
    'last_name', v_member.last_name,
    'search_text', v_member.search_text,
    'phone', null,
    'email', null,
    'date_of_birth', null
  );
  update audit_log
  set old_data = case when old_data is null then null else old_data || v_scrub end,
      new_data = case when new_data is null then null else new_data || v_scrub end
  where table_name = 'members' and row_id = p_member::text and gym_id = v_staff.gym_id;

  return v_member;
end;
$$;

revoke execute on function anonymize_member(uuid) from public, anon;
