-- Run after 202609140001_creatives.sql. Images are PRIVATE, not public URLs.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-assets', 'creative-assets', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "Read own creative assets" on storage.objects;
create policy "Read own creative assets" on storage.objects for select to authenticated
using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Upload own creative assets" on storage.objects;
create policy "Upload own creative assets" on storage.objects for insert to authenticated
with check (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
