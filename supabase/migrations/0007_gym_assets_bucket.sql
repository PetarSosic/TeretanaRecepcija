-- M-03: the private bucket that holds the gym logo (doc 07 §6).
-- All staff may read it; the owner writes through the uploadLogo server action, which
-- uses the service role, so no write policy exists for `authenticated`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-assets', 'gym-assets', false, 1048576,
        array['image/png', 'image/jpeg'])          -- US-21.1: PNG or JPG, at most 1 MB
on conflict (id) do nothing;

create policy gym_assets_read on storage.objects
  for select to authenticated
  using (bucket_id = 'gym-assets' and my_gym()::text = (storage.foldername(name))[1]);
