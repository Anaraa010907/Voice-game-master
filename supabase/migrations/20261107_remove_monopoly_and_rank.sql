-- Removes the "Монгол Монополь" board game and the competitive rank system.
-- Only the win/loss statistics stay: profiles keep wins, losses, draws, total_matches,
-- win_rate and win streaks, and finished games keep adding to them exactly once per match.
--
-- DESTRUCTIVE: deletes every Monopoly room (with its seats, game state and voice room),
-- drops the rank columns from profiles and match_records, and drops the rating_changes history.
-- Deploy the updated `game` Edge Function together with this migration: the function now calls
-- record_match_outcome, which replaces process_verified_competitive_match.

-- ─── 1. Monopoly ────────────────────────────────────────────────────────────

-- Seats, game state and published views cascade from game_rooms; voice members cascade from voice_rooms.
delete from public.voice_rooms
where room_code in (select room_code from public.game_rooms where game_type = 'monopoly');
delete from public.game_rooms where game_type = 'monopoly';

-- Rooms can only host Mafia now. The constraint was created inline, so look it up by its definition.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint as con
    where con.conrelid = 'public.game_rooms'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%game_type%'
  loop
    execute format('alter table public.game_rooms drop constraint %I', constraint_name);
  end loop;
end;
$$;
alter table public.game_rooms add constraint game_rooms_game_type_check check (game_type in ('mafia'));

-- Board games allowed tables of 2–3; Mafia needs at least 4 seats again.
alter table public.game_rooms drop constraint if exists game_rooms_max_players_check;
alter table public.game_rooms add constraint game_rooms_max_players_check check (max_players between 4 and 12);

-- ─── 2. Rank → win count only ───────────────────────────────────────────────

-- The public leaderboard view exposed rank columns; recreate it with wins instead.
drop view if exists public.leaderboard_profiles;

drop function if exists public.process_verified_competitive_match(uuid, uuid, text, boolean, boolean);
drop function if exists public.rank_for_points(integer);

drop table if exists public.rating_changes;

drop index if exists public.profiles_leaderboard_order;
alter table public.profiles drop column if exists rank_name;
alter table public.profiles drop column if exists rank_points;

-- match_records stays: its (match_id, user_id) key is what keeps a match from being counted twice.
alter table public.match_records drop column if exists rp_change;
alter table public.match_records drop column if exists rank_points_before;
alter table public.match_records drop column if exists rank_points_after;

create index if not exists profiles_wins_order on public.profiles (wins desc, display_name asc);

-- Adds one finished match to a player's statistics. Idempotent per (match, player).
create or replace function public.record_match_outcome(
  p_match_id uuid,
  p_user_id uuid,
  p_outcome text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_outcome not in ('win', 'loss', 'draw') then
    raise exception 'Unsupported match outcome';
  end if;
  perform 1 from public.profiles as profile where profile.id = p_user_id for update;
  if not found then raise exception 'Profile does not exist'; end if;

  insert into public.match_records (match_id, user_id, outcome)
  values (p_match_id, p_user_id, p_outcome)
  on conflict (match_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  update public.profiles as profile
  set total_matches = profile.total_matches + 1,
      wins = profile.wins + case when p_outcome = 'win' then 1 else 0 end,
      losses = profile.losses + case when p_outcome = 'loss' then 1 else 0 end,
      draws = profile.draws + case when p_outcome = 'draw' then 1 else 0 end,
      win_rate = round(((profile.wins + case when p_outcome = 'win' then 1 else 0 end)::numeric / (profile.total_matches + 1)) * 100, 2),
      player_level = greatest(1, ceil((profile.total_matches + 1)::numeric / 5)::integer),
      current_win_streak = case when p_outcome = 'win' then profile.current_win_streak + 1 else 0 end,
      best_win_streak = greatest(profile.best_win_streak, case when p_outcome = 'win' then profile.current_win_streak + 1 else 0 end)
  where profile.id = p_user_id;
  return true;
end;
$$;

revoke all on function public.record_match_outcome(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_match_outcome(uuid, uuid, text) to service_role;

create or replace view public.leaderboard_profiles
with (security_barrier = true)
as
select id, display_name, avatar_key, wins, total_matches
from public.profiles;

revoke all on public.leaderboard_profiles from public, anon, authenticated;
grant select on public.leaderboard_profiles to anon, authenticated;
