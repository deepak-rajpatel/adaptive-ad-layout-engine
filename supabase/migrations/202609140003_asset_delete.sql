-- Run after 202609140002_assets.sql. Lets users remove images from their own folder only.
begin;
drop policy if exists "Delete own creative assets" on storage.objects;
create policy "Delete own creative assets" on storage.objects for delete to authenticated
using (bucket_id = 'creative-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
