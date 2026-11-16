-- Battle Pass. A season has tiers; games give XP (+50 a finished game, +50 a win, +100 the first
-- game of the day, Ulaanbaatar time); each tier pays a free reward and, with the premium track
-- bought for diamonds, a premium one. Seasons are prepared as drafts and an admin starts them.
-- While a season runs its premium looks are only in the pass; when it ends they become
-- 'limited' (sold only as «Онцлох» offers). Rewards can be claimed until 3 days after the end.

create table if not exists public.pass_seasons (
  id integer primary key,
  name text not null,
  tiers integer not null default 30 check (tiers between 1 and 100),
  xp_per_tier integer not null default 300 check (xp_per_tier > 0),
  premium_price integer not null default 250 check (premium_price >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pass_rewards (
  season_id integer not null references public.pass_seasons (id) on delete cascade,
  tier integer not null check (tier >= 1),
  track text not null check (track in ('free', 'premium')),
  kind text not null check (kind in ('coins', 'diamonds', 'item')),
  amount integer not null default 0 check (amount >= 0),
  item_key text references public.shop_items (key),
  primary key (season_id, tier, track),
  constraint pass_rewards_item check ((kind = 'item') = (item_key is not null))
);

create table if not exists public.pass_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id integer not null references public.pass_seasons (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  premium boolean not null default false,
  premium_at timestamptz,
  xp_day date,
  primary key (user_id, season_id)
);

create table if not exists public.pass_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id integer not null references public.pass_seasons (id) on delete cascade,
  tier integer not null,
  track text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, season_id, tier, track)
);

alter table public.pass_seasons enable row level security;
alter table public.pass_rewards enable row level security;
alter table public.pass_progress enable row level security;
alter table public.pass_claims enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'pass_seasons' and policyname = 'Seasons are public') then
    create policy "Seasons are public" on public.pass_seasons for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pass_rewards' and policyname = 'Pass rewards are public') then
    create policy "Pass rewards are public" on public.pass_rewards for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pass_progress' and policyname = 'Players read their pass') then
    create policy "Players read their pass" on public.pass_progress for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pass_claims' and policyname = 'Players read their claims') then
    create policy "Players read their claims" on public.pass_claims for select to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;
revoke all on public.pass_seasons, public.pass_rewards, public.pass_progress, public.pass_claims from anon, authenticated;
grant select on public.pass_seasons, public.pass_rewards to anon, authenticated;
grant select on public.pass_progress, public.pass_claims to authenticated;

-- Season 1 free-track looks, never sold.
insert into public.shop_items (key, kind, name, description, icon, price, sort, active, currency, source) values
  ('border-season1', 'border', '1-р улирлын шугам', 'Мөнгөлөг хөх, улирлын хүрээ', '', 0, 300, true, 'coin', 'pass'),
  ('plate-season1', 'nameplate', '1-р улирлын хавтан', 'Мөнгөн далбаа, улирлын тэмдэг', '', 0, 301, true, 'coin', 'pass'),
  ('frame-season1', 'frame', '1-р улирлын хүрээ', 'Мөнгөн далбаатай цагираг', '', 0, 302, true, 'coin', 'pass')
on conflict (key) do nothing;

-- The season that is running now, if any.
create or replace function public.current_pass_season()
returns public.pass_seasons
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.pass_seasons where status = 'active' and now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
$$;

-- XP for a finished game (none for leaving early). Called from record_game_result.
create or replace function public.award_pass_xp(p_user uuid, p_won boolean, p_left boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  season public.pass_seasons;
  progress public.pass_progress;
  today date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  gain integer;
begin
  if p_left then return 0; end if;
  season := public.current_pass_season();
  if season.id is null then return 0; end if;
  insert into public.pass_progress (user_id, season_id) values (p_user, season.id) on conflict do nothing;
  select * into progress from public.pass_progress where user_id = p_user and season_id = season.id for update;
  gain := 50 + case when p_won then 50 else 0 end + case when progress.xp_day is distinct from today then 100 else 0 end;
  gain := least(gain, greatest(0, season.tiers * season.xp_per_tier - progress.xp));
  update public.pass_progress set xp = xp + gain, xp_day = today where user_id = p_user and season_id = season.id;
  return gain;
end;
$$;
revoke all on function public.award_pass_xp(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.current_pass_season() from public, anon, authenticated;

-- Claim one reward: the tier must be reached, the premium track bought for premium rewards.
-- A look the player already owns pays 300 coins instead.
create or replace function public.claim_pass_reward(p_season integer, p_tier integer, p_track text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  season public.pass_seasons;
  reward public.pass_rewards;
  progress public.pass_progress;
  converted boolean := false;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into season from public.pass_seasons
  where id = p_season and status in ('active', 'ended') and now() >= starts_at and now() < ends_at + interval '3 days';
  if not found then raise exception 'Энэ улирал идэвхгүй байна.' using errcode = 'P0001'; end if;
  select * into reward from public.pass_rewards where season_id = p_season and tier = p_tier and track = p_track;
  if not found then raise exception 'Шагнал олдсонгүй.' using errcode = 'P0002'; end if;
  select * into progress from public.pass_progress where user_id = me and season_id = p_season;
  if coalesce(progress.xp, 0) < p_tier * season.xp_per_tier then raise exception 'Энэ шатанд хүрээгүй байна.' using errcode = 'P0001'; end if;
  if p_track = 'premium' and not coalesce(progress.premium, false) then raise exception 'Алтан замыг нээж байж авна.' using errcode = 'P0001'; end if;
  insert into public.pass_claims (user_id, season_id, tier, track) values (me, p_season, p_tier, p_track) on conflict do nothing;
  if not found then raise exception 'Энэ шагналыг аль хэдийн авсан.' using errcode = 'P0001'; end if;
  if reward.kind = 'coins' then
    update public.profiles set coins = coins + reward.amount where id = me;
  elsif reward.kind = 'diamonds' then
    update public.profiles set diamonds = diamonds + reward.amount where id = me;
  elsif exists (select 1 from public.player_items where user_id = me and item_key = reward.item_key) then
    update public.profiles set coins = coins + 300 where id = me;
    converted := true;
  else
    insert into public.player_items (user_id, item_key) values (me, reward.item_key);
  end if;
  return json_build_object('kind', reward.kind, 'amount', reward.amount, 'item_key', reward.item_key, 'converted', converted);
end;
$$;
revoke all on function public.claim_pass_reward(integer, integer, text) from public, anon;
grant execute on function public.claim_pass_reward(integer, integer, text) to authenticated;

-- Claim everything reached and not yet taken. Returns how many rewards were claimed.
create or replace function public.claim_all_pass_rewards(p_season integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  season public.pass_seasons;
  progress public.pass_progress;
  reward record;
  claimed integer := 0;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into season from public.pass_seasons where id = p_season;
  select * into progress from public.pass_progress where user_id = me and season_id = p_season;
  for reward in
    select r.tier, r.track from public.pass_rewards r
    where r.season_id = p_season and r.tier * season.xp_per_tier <= coalesce(progress.xp, 0)
      and (r.track = 'free' or coalesce(progress.premium, false))
      and not exists (select 1 from public.pass_claims c where c.user_id = me and c.season_id = p_season and c.tier = r.tier and c.track = r.track)
    order by r.tier, r.track
  loop
    perform public.claim_pass_reward(p_season, reward.tier, reward.track);
    claimed := claimed + 1;
  end loop;
  return claimed;
end;
$$;
revoke all on function public.claim_all_pass_rewards(integer) from public, anon;
grant execute on function public.claim_all_pass_rewards(integer) to authenticated;

-- Open the premium track for diamonds (admins free). Returns the diamonds left.
create or replace function public.buy_pass_premium(p_season integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  season public.pass_seasons;
  cost integer;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into season from public.pass_seasons where id = p_season and status = 'active' and now() >= starts_at and now() < ends_at;
  if not found then raise exception 'Энэ улирал идэвхгүй байна.' using errcode = 'P0001'; end if;
  insert into public.pass_progress (user_id, season_id) values (me, p_season) on conflict do nothing;
  if exists (select 1 from public.pass_progress where user_id = me and season_id = p_season and premium) then
    raise exception 'Алтан зам аль хэдийн нээлттэй.' using errcode = 'P0001';
  end if;
  cost := case when public.is_admin() then 0 else season.premium_price end;
  update public.profiles set diamonds = diamonds - cost where id = me and diamonds >= cost returning diamonds into balance;
  if not found then raise exception 'Алмаз хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  update public.pass_progress set premium = true, premium_at = now() where user_id = me and season_id = p_season;
  return balance;
end;
$$;
revoke all on function public.buy_pass_premium(integer) from public, anon;
grant execute on function public.buy_pass_premium(integer) to authenticated;

-- Premium looks of a season leave the shop while it runs, and come back as offers afterwards.
create or replace function public.close_pass_season(p_season integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pass_seasons set status = 'ended', ends_at = least(ends_at, now()) where id = p_season and status = 'active';
  update public.shop_items si set source = 'limited'
  from public.pass_rewards r
  where r.season_id = p_season and r.track = 'premium' and r.kind = 'item' and si.key = r.item_key and si.source = 'pass';
end;
$$;
revoke all on function public.close_pass_season(integer) from public, anon, authenticated;

create or replace function public.close_ended_pass_seasons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  season record;
  closed integer := 0;
begin
  for season in select id from public.pass_seasons where status = 'active' and ends_at <= now() loop
    perform public.close_pass_season(season.id);
    closed := closed + 1;
  end loop;
  return closed;
end;
$$;
revoke all on function public.close_ended_pass_seasons() from public, anon, authenticated;

-- Admin: start a draft season now for a number of days at a premium price, or end the running one.
create or replace function public.admin_start_pass_season(p_season integer, p_days integer, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  season public.pass_seasons;
begin
  if p_days is null or p_days < 7 or p_days > 120 then raise exception 'Улирал 7-оос 120 хоног байна.' using errcode = '22023'; end if;
  if p_price is null or p_price < 0 or p_price > 100000 then raise exception 'Үнэ буруу байна.' using errcode = '22023'; end if;
  perform public.close_ended_pass_seasons();
  if exists (select 1 from public.pass_seasons where status = 'active') then raise exception 'Өөр улирал явж байна. Эхлээд түүнийг дуусгана уу.' using errcode = 'P0001'; end if;
  select * into season from public.pass_seasons where id = p_season and status = 'draft';
  if not found then raise exception 'Бэлэн улирал олдсонгүй.' using errcode = 'P0002'; end if;
  update public.pass_seasons set status = 'active', starts_at = now(), ends_at = now() + make_interval(days => p_days), premium_price = p_price where id = p_season;
  -- Its premium looks are only in the pass from now on; running offers on them stop.
  update public.shop_items si set source = 'pass'
  from public.pass_rewards r
  where r.season_id = p_season and r.track = 'premium' and r.kind = 'item' and si.key = r.item_key and si.source in ('shop', 'limited');
  update public.shop_offers o set ends_at = greatest(o.starts_at + interval '1 second', now())
  from public.pass_rewards r
  where r.season_id = p_season and r.kind = 'item' and o.item_key = r.item_key and o.ends_at > now();
  insert into public.admin_actions (admin_id, action, target, detail) values (me, 'pass-start', season.name, season.name || ' · ' || p_days || ' хоног · ' || p_price || ' алмаз');
end;
$$;
revoke all on function public.admin_start_pass_season(integer, integer, integer) from public, anon;
grant execute on function public.admin_start_pass_season(integer, integer, integer) to authenticated;

create or replace function public.admin_end_pass_season(p_season integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  season_name text;
begin
  select name into season_name from public.pass_seasons where id = p_season and status = 'active';
  if season_name is null then raise exception 'Явж буй улирал олдсонгүй.' using errcode = 'P0002'; end if;
  perform public.close_pass_season(p_season);
  insert into public.admin_actions (admin_id, action, target, detail) values (me, 'pass-end', season_name, season_name);
end;
$$;
revoke all on function public.admin_end_pass_season(integer) from public, anon;
grant execute on function public.admin_end_pass_season(integer) to authenticated;

-- Admin: how many play the season, how many bought the premium track.
create or replace function public.admin_pass_stats(p_season integer)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return json_build_object(
    'players', (select count(*) from public.pass_progress where season_id = p_season and xp > 0),
    'premium', (select count(*) from public.pass_progress where season_id = p_season and premium),
    'claims', (select count(*) from public.pass_claims where season_id = p_season));
end;
$$;
revoke all on function public.admin_pass_stats(integer) from public, anon;
grant execute on function public.admin_pass_stats(integer) to authenticated;

-- Season 1, ready as a draft: 30 tiers × 300 XP.
insert into public.pass_seasons (id, name, tiers, xp_per_tier, premium_price, status)
values (1, '1-р улирал · Сүүдрийн хот', 30, 300, 250, 'draft')
on conflict (id) do nothing;

insert into public.pass_rewards (season_id, tier, track, kind, amount, item_key) values
  (1, 1, 'free', 'coins', 100, null), (1, 2, 'free', 'coins', 50, null), (1, 3, 'free', 'coins', 100, null),
  (1, 4, 'free', 'coins', 50, null), (1, 5, 'free', 'coins', 150, null), (1, 6, 'free', 'coins', 50, null),
  (1, 7, 'free', 'coins', 100, null), (1, 8, 'free', 'coins', 50, null), (1, 9, 'free', 'coins', 100, null),
  (1, 10, 'free', 'item', 0, 'border-season1'), (1, 11, 'free', 'coins', 100, null), (1, 12, 'free', 'coins', 50, null),
  (1, 13, 'free', 'coins', 100, null), (1, 14, 'free', 'coins', 50, null), (1, 15, 'free', 'diamonds', 10, null),
  (1, 16, 'free', 'coins', 100, null), (1, 17, 'free', 'coins', 50, null), (1, 18, 'free', 'coins', 100, null),
  (1, 19, 'free', 'coins', 50, null), (1, 20, 'free', 'item', 0, 'plate-season1'), (1, 21, 'free', 'coins', 100, null),
  (1, 22, 'free', 'coins', 50, null), (1, 23, 'free', 'coins', 150, null), (1, 24, 'free', 'coins', 50, null),
  (1, 25, 'free', 'diamonds', 15, null), (1, 26, 'free', 'coins', 100, null), (1, 27, 'free', 'coins', 50, null),
  (1, 28, 'free', 'coins', 150, null), (1, 29, 'free', 'coins', 100, null), (1, 30, 'free', 'item', 0, 'frame-season1'),
  (1, 1, 'premium', 'item', 0, 'frame-mafia-city'), (1, 2, 'premium', 'diamonds', 10, null), (1, 3, 'premium', 'coins', 300, null),
  (1, 4, 'premium', 'coins', 200, null), (1, 5, 'premium', 'item', 0, 'plate-skull-king'), (1, 6, 'premium', 'coins', 300, null),
  (1, 7, 'premium', 'diamonds', 15, null), (1, 8, 'premium', 'coins', 300, null), (1, 9, 'premium', 'coins', 200, null),
  (1, 10, 'premium', 'item', 0, 'frame-gold-skull'), (1, 11, 'premium', 'coins', 300, null), (1, 12, 'premium', 'diamonds', 20, null),
  (1, 13, 'premium', 'coins', 300, null), (1, 14, 'premium', 'coins', 200, null), (1, 15, 'premium', 'item', 0, 'plate-fire-dragon'),
  (1, 16, 'premium', 'coins', 400, null), (1, 17, 'premium', 'diamonds', 20, null), (1, 18, 'premium', 'coins', 300, null),
  (1, 19, 'premium', 'coins', 300, null), (1, 20, 'premium', 'item', 0, 'frame-twin-serpent'), (1, 21, 'premium', 'coins', 400, null),
  (1, 22, 'premium', 'diamonds', 25, null), (1, 23, 'premium', 'coins', 400, null), (1, 24, 'premium', 'coins', 300, null),
  (1, 25, 'premium', 'coins', 500, null), (1, 26, 'premium', 'diamonds', 30, null), (1, 27, 'premium', 'coins', 400, null),
  (1, 28, 'premium', 'coins', 500, null), (1, 29, 'premium', 'coins', 500, null), (1, 30, 'premium', 'item', 0, 'frame-eagle-crown')
on conflict do nothing;

-- Close seasons whose time is up (hourly).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'close-pass-seasons') then
    perform cron.unschedule('close-pass-seasons');
  end if;
  perform cron.schedule('close-pass-seasons', '5 * * * *', 'select public.close_ended_pass_seasons()');
end $$;

-- Games give Battle Pass XP (same function as in 20261109, plus the award_pass_xp call).
create or replace function public.record_game_result(
  p_match_id uuid, p_user_id uuid, p_game_type text, p_room_code text, p_outcome text, p_ranked boolean, p_delta integer
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
  won boolean := p_outcome = 'win';
  ranked boolean := coalesce(p_ranked, false);
  left_early boolean := coalesce(p_delta, 0) = -20;
  rank_row public.player_ranks;
  old_points integer;
  new_points integer;
  old_level integer;
  new_level integer;
  peak_level integer;
  today integer;
  coin_gain integer := 0;
  bonus integer := 0;
  pass_gain integer := 0;
  title_prefix text := case p_game_type when 'mafia' then 'title-mafia-' else 'title-mono-' end;
begin
  if p_outcome not in ('win', 'loss') then raise exception 'Unsupported outcome'; end if;
  if p_game_type not in ('mafia', 'monopoly') then raise exception 'Unsupported game'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return json_build_object('processed', false);
  end if;

  insert into public.match_records (match_id, user_id, outcome, rp_change, rank_points_before, rank_points_after, room_code)
  values (p_match_id, p_user_id, p_outcome, 0, 0, 0, p_room_code)
  on conflict (match_id, user_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return json_build_object('processed', false); end if;

  if not left_early then
    coin_gain := case when won then (case when ranked then 50 else 30 end) else (case when ranked then 15 else 10 end) end;
  end if;
  select case when p.game_coins_day = current_date then p.game_coins_today else 0 end into today
  from public.profiles p where p.id = p_user_id for update;
  coin_gain := greatest(0, least(coin_gain, 500 - today));

  update public.profiles set
    total_matches = total_matches + 1,
    wins = wins + case when won then 1 else 0 end,
    losses = losses + case when won then 0 else 1 end,
    win_rate = round(((wins + case when won then 1 else 0 end)::numeric / (total_matches + 1)) * 100, 2),
    player_level = greatest(1, ceil((total_matches + 1)::numeric / 5)::integer),
    current_win_streak = case when won then current_win_streak + 1 else 0 end,
    best_win_streak = greatest(best_win_streak, case when won then current_win_streak + 1 else 0 end),
    coins = coins + coin_gain,
    game_coins_day = current_date,
    game_coins_today = today + coin_gain
  where id = p_user_id;

  -- Battle Pass XP while a season runs (nothing for leaving early).
  pass_gain := public.award_pass_xp(p_user_id, won, left_early);

  if not ranked then
    update public.match_records set coins_earned = coin_gain where match_id = p_match_id and user_id = p_user_id;
    return json_build_object('processed', true, 'ranked', false, 'coins', coin_gain, 'pass_xp', pass_gain);
  end if;

  insert into public.player_ranks (user_id, game_type) values (p_user_id, p_game_type) on conflict do nothing;
  select * into rank_row from public.player_ranks where user_id = p_user_id and game_type = p_game_type for update;
  old_points := rank_row.points;
  new_points := greatest(0, old_points + greatest(-40, least(60, coalesce(p_delta, 0))));
  old_level := public.rank_level(old_points);
  new_level := public.rank_level(new_points);
  peak_level := public.rank_level(rank_row.peak_points);

  update public.player_ranks set
    points = new_points,
    peak_points = greatest(peak_points, new_points),
    matches = matches + 1,
    wins = wins + case when won then 1 else 0 end,
    losses = losses + case when won then 0 else 1 end,
    current_streak = case when won then current_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when won then current_streak + 1 else 0 end),
    updated_at = now()
  where user_id = p_user_id and game_type = p_game_type;

  insert into public.rating_changes (match_id, user_id, outcome, rp_change, rank_points_before, rank_points_after, previous_rank, new_rank, game_type, room_code)
  values (p_match_id, p_user_id, p_outcome, new_points - old_points, old_points, new_points, old_level::text, new_level::text, p_game_type, p_room_code)
  on conflict (match_id, user_id) do nothing;

  -- Every rank reached unlocks its title for good.
  if new_level >= 2 then
    insert into public.player_items (user_id, item_key)
    select p_user_id, title_prefix || lvl from generate_series(2, new_level) as lvl
    on conflict do nothing;
  end if;

  -- Ranks reached for the first time pay their prize: coins, and the prize item once one is set.
  if new_level > peak_level then
    select coalesce(sum(r.coins), 0)::integer into bonus from public.rank_rewards r
    where r.game_type = p_game_type and r.level > peak_level and r.level <= new_level;
    insert into public.player_items (user_id, item_key)
    select p_user_id, r.item_key from public.rank_rewards r
    where r.game_type = p_game_type and r.level > peak_level and r.level <= new_level and r.item_key is not null
    on conflict do nothing;
    update public.profiles set coins = coins + bonus where id = p_user_id;
  end if;

  update public.match_records set rp_change = new_points - old_points, rank_points_before = old_points, rank_points_after = new_points,
    coins_earned = coin_gain + bonus
  where match_id = p_match_id and user_id = p_user_id;

  return json_build_object('processed', true, 'ranked', true, 'coins', coin_gain, 'rank_bonus', bonus, 'pass_xp', pass_gain,
    'before', old_points, 'after', new_points, 'level_before', old_level, 'level_after', new_level);
end;
$$;

