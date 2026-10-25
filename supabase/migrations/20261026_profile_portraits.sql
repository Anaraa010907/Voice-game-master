-- Profile pictures may also be one of the app's built-in portraits (/assets/avatars/portrait-1..8.webp),
-- besides a photo in this project's public `avatars` bucket.
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (
  avatar_url is null
  or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
  or avatar_url ~ '^/assets/avatars/portrait-[1-8]\.webp$'
);
