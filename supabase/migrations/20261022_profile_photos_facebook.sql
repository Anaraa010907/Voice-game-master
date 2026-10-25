-- Profile photos (Supabase Storage) and Facebook sign-in support.

-- 1. Photo URL on the profile. Only images from this project's public `avatars` bucket are accepted.
alter table public.profiles
  add column if not exists avatar_url text
  check (avatar_url is null or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');

grant update (display_name, avatar_key, avatar_url) on public.profiles to authenticated;

-- Seats copy the photo when a player joins, so lobby and game screens can show it.
alter table public.game_room_players add column if not exists avatar_url text;

-- 2. Public avatars bucket: anyone can view, each user may only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar owners read their files" on storage.objects;
create policy "Avatar owners read their files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Avatar owners upload" on storage.objects;
create policy "Avatar owners upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Avatar owners update" on storage.objects;
create policy "Avatar owners update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Avatar owners delete" on storage.objects;
create policy "Avatar owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. New accounts: Facebook sends `full_name` / `name` instead of our `display_name`.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_name text;
  safe_avatar text;
  method text;
begin
  safe_name := left(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    'Player'
  )), 24);
  if char_length(safe_name) < 2 then safe_name := 'Player'; end if;
  safe_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_key', 'rose');
  if safe_avatar not in ('rose', 'violet', 'gold', 'teal', 'blue', 'plum') then safe_avatar := 'rose'; end if;
  method := case when new.phone is not null and new.email is null then 'phone' else 'email' end;

  insert into public.profiles (id, display_name, avatar_key, registration_method, is_verified)
  values (
    new.id,
    safe_name,
    safe_avatar,
    method,
    new.email_confirmed_at is not null or new.phone_confirmed_at is not null
  )
  on conflict (id) do update set
    is_verified = excluded.is_verified,
    registration_method = excluded.registration_method;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
