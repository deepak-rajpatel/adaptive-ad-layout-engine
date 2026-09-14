-- Run once in your Supabase project's SQL Editor.
-- No anonymous access. Every row belongs to the signed-in user.
begin;
create table if not exists public.creatives (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  collection text not null default 'Unsorted' check (char_length(collection) <= 80),
  favorite boolean not null default false,
  creative jsonb not null check (jsonb_typeof(creative) = 'object' and octet_length(creative::text) <= 3500000),
  surface jsonb not null check (jsonb_typeof(surface) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists creatives_user_updated on public.creatives(user_id, updated_at desc);
alter table public.creatives enable row level security;
revoke all on public.creatives from anon;
grant select, insert, update, delete on public.creatives to authenticated;
drop policy if exists "Read own creatives" on public.creatives;
create policy "Read own creatives" on public.creatives for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own creatives" on public.creatives;
create policy "Insert own creatives" on public.creatives for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own creatives" on public.creatives;
create policy "Update own creatives" on public.creatives for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own creatives" on public.creatives;
create policy "Delete own creatives" on public.creatives for delete to authenticated using ((select auth.uid()) = user_id);
commit;
