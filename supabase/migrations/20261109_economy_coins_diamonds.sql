-- Two currencies: coins are earned by playing, diamonds are bought with real money (top-up comes later).
alter table public.profiles add column if not exists diamonds integer not null default 0;
alter table public.profiles drop constraint if exists profiles_diamonds_not_negative;
alter table public.profiles add constraint profiles_diamonds_not_negative check (diamonds >= 0);
alter table public.profiles add column if not exists game_coins_day date;
alter table public.profiles add column if not exists game_coins_today integer not null default 0;

alter table public.shop_items add column if not exists currency text not null default 'coin';
alter table public.shop_items drop constraint if exists shop_items_currency_check;
alter table public.shop_items add constraint shop_items_currency_check check (currency in ('coin', 'diamond'));

-- Round (drawn) frames and gifts stay on coins; painted frames, nameplates and name borders cost diamonds.
update public.shop_items s set currency = 'diamond', price = v.price
from (values
  ('frame-rose-night', 60), ('frame-ice-butterfly', 60), ('frame-fire-dragon', 80), ('frame-mafia-city', 90),
  ('frame-gold-skull', 90), ('frame-butterfly', 100), ('frame-twin-serpent', 110), ('frame-eagle-crown', 120),
  ('plate-ice-crystal', 50), ('plate-royal-crown', 60), ('plate-skull-king', 70), ('plate-fire-dragon', 80),
  ('border-gold', 20), ('border-neon', 25), ('border-ice', 30), ('border-fire', 40), ('border-ruby', 45), ('border-royal', 75)
) as v(key, price)
where s.key = v.key;

-- Coins and a rank prize for reaching each rank the first time; item_key null = prize still to be chosen (shown "coming soon").
create table if not exists public.rank_rewards (
  game_type text not null check (game_type in ('mafia', 'monopoly')),
  level integer not null check (level between 2 and 9),
  coins integer not null default 0 check (coins >= 0),
  item_key text references public.shop_items (key),
  primary key (game_type, level)
);
alter table public.rank_rewards enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rank_rewards' and policyname = 'Rank rewards are public') then
    create policy "Rank rewards are public" on public.rank_rewards for select to anon, authenticated using (true);
  end if;
end $$;
revoke all on public.rank_rewards from anon, authenticated;
grant select on public.rank_rewards to anon, authenticated;
insert into public.rank_rewards (game_type, level, coins)
select g, l, c from (values ('mafia'), ('monopoly')) as games(g)
cross join (values (2, 100), (3, 200), (4, 300), (5, 500), (6, 700), (7, 1000), (8, 1500), (9, 2500)) as levels(l, c)
on conflict do nothing;

-- Each finished game remembers its room and the coins it paid out, for the results screen.
alter table public.match_records add column if not exists room_code text;
alter table public.match_records add column if not exists coins_earned integer not null default 0;
create index if not exists match_records_room on public.match_records (room_code, user_id);

-- One finished game for one player, called only by the game server. Idempotent per match and player.
-- Every game counts in the statistics and pays coins (none for leaving early: p_delta = -20, which is
-- RANK_POINTS.leave in _shared/ranks.ts); at most 500 coins a day come from games. Ranked games also
-- move the rank, unlock titles, and pay each rank's prize the first time it is reached.
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

  if not ranked then
    update public.match_records set coins_earned = coin_gain where match_id = p_match_id and user_id = p_user_id;
    return json_build_object('processed', true, 'ranked', false, 'coins', coin_gain);
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

  return json_build_object('processed', true, 'ranked', true, 'coins', coin_gain, 'rank_bonus', bonus,
    'before', old_points, 'after', new_points, 'level_before', old_level, 'level_after', new_level);
end;
$$;

revoke all on function public.record_game_result(uuid, uuid, text, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.record_game_result(uuid, uuid, text, text, text, boolean, integer) to service_role;

-- Takes an item's price from the right purse (coins or diamonds). Admins pay nothing.
-- Returns the balance left in that purse.
create or replace function public.spend_for_item(p_user uuid, p_item public.shop_items)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cost integer := case when public.is_admin() then 0 else p_item.price end;
  balance integer;
begin
  if p_item.currency = 'diamond' then
    update public.profiles set diamonds = diamonds - cost where id = p_user and diamonds >= cost returning diamonds into balance;
    if not found then raise exception 'Алмаз хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  else
    update public.profiles set coins = coins - cost where id = p_user and coins >= cost returning coins into balance;
    if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  end if;
  return balance;
end;
$$;
revoke all on function public.spend_for_item(uuid, public.shop_items) from public, anon, authenticated;

create or replace function public.buy_item(p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.shop_items;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into item from public.shop_items where key = p_key and active;
  if not found then raise exception 'Бараа олдсонгүй.' using errcode = 'P0002'; end if;
  if item.kind = 'gift' then raise exception 'Бэлгийг тоглолтын үеэр тоглогч дээр дарж илгээнэ.' using errcode = 'P0001'; end if;
  if item.kind = 'title' then raise exception 'Цолыг рэйтинг тоглолтод хожиж авна.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_items where user_id = me and item_key = p_key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  balance := public.spend_for_item(me, item);
  insert into public.player_items (user_id, item_key) values (me, p_key);
  return balance;
end;
$$;

create or replace function public.send_gift(p_room text, p_to uuid, p_gift text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.shop_items;
  sender_name text;
  receiver_name text;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  if p_to = me then raise exception 'Өөртөө бэлэг илгээх боломжгүй.' using errcode = 'P0001'; end if;
  select * into item from public.shop_items where key = p_gift and kind = 'gift' and active;
  if not found then raise exception 'Бэлэг олдсонгүй.' using errcode = 'P0002'; end if;
  select display_name into sender_name from public.game_room_players where room_code = p_room and user_id = me;
  if not found then raise exception 'Та энэ өрөөнд байхгүй байна.' using errcode = '42501'; end if;
  select display_name into receiver_name from public.game_room_players where room_code = p_room and user_id = p_to and not is_bot;
  if not found then raise exception 'Тоглогч энэ өрөөнд байхгүй байна.' using errcode = 'P0002'; end if;
  if (select count(*) from public.gifts where from_user = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Хэт олон бэлэг илгээлээ. Түр хүлээнэ үү.' using errcode = 'P0001';
  end if;
  balance := public.spend_for_item(me, item);
  insert into public.gifts (room_code, from_user, to_user, from_name, to_name, gift_key)
  values (p_room, me, p_to, sender_name, receiver_name, p_gift);
  return balance;
end;
$$;

create or replace function public.send_friend_gift(p_to uuid, p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.shop_items;
  sender_name text;
  receiver_name text;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  if not public.are_friends(me, p_to) then raise exception 'Зөвхөн найздаа бэлэг илгээх боломжтой.' using errcode = '42501'; end if;
  if exists (select 1 from public.game_room_players s join public.game_rooms g on g.room_code = s.room_code
             where s.user_id = me and g.status = 'playing') then
    raise exception 'Тоглолтын үеэр хүрээ, нэрийн хавтан бэлэглэх боломжгүй. Тоглолт дууссаны дараа илгээнэ үү.' using errcode = 'P0001';
  end if;
  select * into item from public.shop_items where key = p_key and active and kind in ('gift', 'frame', 'nameplate', 'border');
  if not found then raise exception 'Бэлэг олдсонгүй.' using errcode = 'P0002'; end if;
  if item.kind <> 'gift' and exists (select 1 from public.player_items where user_id = p_to and item_key = p_key) then
    raise exception 'Найзад тань энэ бараа аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.gifts where from_user = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Хэт олон бэлэг илгээлээ. Түр хүлээнэ үү.' using errcode = 'P0001';
  end if;
  balance := public.spend_for_item(me, item);
  select display_name into sender_name from public.profiles where id = me;
  select display_name into receiver_name from public.profiles where id = p_to;
  if item.kind <> 'gift' then
    insert into public.player_items (user_id, item_key) values (p_to, p_key);
  end if;
  insert into public.gifts (room_code, from_user, to_user, from_name, to_name, gift_key) values ('DM', me, p_to, sender_name, receiver_name, p_key);
  insert into public.direct_messages (sender, recipient, kind, body, gift_key) values (me, p_to, 'gift', item.name, p_key);
  return balance;
end;
$$;

-- Admins add or take diamonds by hand (until top-up is automatic), logged like coins.
create or replace function public.admin_grant_diamonds(p_user uuid, p_amount integer, p_reason text default '')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  balance integer;
  who text;
begin
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then
    raise exception 'Алмазын хэмжээ 1-ээс 1,000,000 хүртэл байна.' using errcode = '22023';
  end if;
  update public.profiles set diamonds = greatest(0, diamonds + p_amount) where id = p_user returning diamonds, display_name into balance, who;
  if not found then raise exception 'Тоглогч олдсонгүй.' using errcode = 'P0002'; end if;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'diamonds', p_user::text, left(who || ' · ' || case when p_amount > 0 then '+' else '' end || p_amount || ' алмаз' || coalesce(' · ' || nullif(trim(p_reason), ''), ''), 120));
  return balance;
end;
$$;

revoke all on function public.buy_item(text), public.send_gift(text, uuid, text), public.send_friend_gift(uuid, text), public.admin_grant_diamonds(uuid, integer, text) from public, anon;
grant execute on function public.buy_item(text), public.send_gift(text, uuid, text), public.send_friend_gift(uuid, text), public.admin_grant_diamonds(uuid, integer, text) to authenticated;
