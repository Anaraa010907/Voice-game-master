drop policy if exists "Public profile fields are readable" on public.profiles;
drop policy if exists "Owners can read their own profile" on public.profiles;

create policy "Owners can read their own profile" on public.profiles
for select to authenticated using (auth.uid() = id);

revoke all on public.profiles, public.match_records, public.rating_changes from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;
grant select on public.match_records, public.rating_changes to authenticated;

insert into public.profiles (id, display_name, avatar_key, registration_method, is_verified)
select
  auth_user.id,
  case
    when char_length(left(trim(coalesce(auth_user.raw_user_meta_data ->> 'display_name', 'Player')), 24)) < 2 then 'Player'
    else left(trim(coalesce(auth_user.raw_user_meta_data ->> 'display_name', 'Player')), 24)
  end,
  case
    when auth_user.raw_user_meta_data ->> 'avatar_key' in ('rose', 'violet', 'gold', 'teal', 'blue', 'plum')
      then auth_user.raw_user_meta_data ->> 'avatar_key'
    else 'rose'
  end,
  case when auth_user.phone is not null and auth_user.email is null then 'phone' else 'email' end,
  auth_user.email_confirmed_at is not null or auth_user.phone_confirmed_at is not null
from auth.users as auth_user
on conflict (id) do nothing;

create or replace view public.leaderboard_profiles
with (security_barrier = true)
as
select id, display_name, avatar_key, rank_name, rank_points, wins, total_matches
from public.profiles;

revoke all on public.leaderboard_profiles from public, anon, authenticated;
grant select on public.leaderboard_profiles to anon, authenticated;
