-- Removes the Monopoly board game and the whole rank system. Only the win count stays.
--
-- What goes:
--   * Monopoly: its rooms (seats, state, views and voice rooms with them) and the 'monopoly' game type.
--   * Rank: ranked rooms (game_rooms.ranked), per-game rank points (player_ranks), the rating history
--     (rating_changes), rank prizes (rank_rewards), rank titles (title-mafia-2..9, title-mono-2..9),
--     profiles.rank_name/rank_points, the rank columns of match_records, and the functions
--     rank_level, rank_for_points, rank_leaderboard, record_game_result and
--     process_verified_competitive_match.
--
-- What stays:
--   * The win count: profiles.wins, losses, draws, total_matches, win_rate, player_level, win streaks.
--   * Coins and Battle Pass XP for every finished game, now from winning and taking part only
--     (record_match_result below; award_pass_xp is unchanged).
--   * Animated frames and borders that used to be rank prizes: players who own them keep them and can
--     still wear them. They are now 'legacy' looks: not sold, not offered, not giftable, and no longer
--     won by anyone.
--
-- Idempotent: every step can run again on an already migrated database.

-- ---------- Monopoly ----------

-- Voice rooms are not tied to game_rooms by a foreign key, so they go first.
delete from public.voice_rooms v
using public.game_rooms g
where g.room_code = v.room_code and g.game_type <> 'mafia';
delete from public.game_rooms where game_type <> 'mafia';

alter table public.game_rooms drop constraint if exists game_rooms_game_type_check;
alter table public.game_rooms add constraint game_rooms_game_type_check check (game_type = 'mafia');

-- ---------- Rank: functions ----------

drop function if exists public.record_game_result(uuid, uuid, text, text, text, boolean, integer);
drop function if exists public.process_verified_competitive_match(uuid, uuid, text, boolean, boolean);
drop function if exists public.rank_leaderboard(text, integer);
drop function if exists public.rank_level(integer);
drop function if exists public.rank_for_points(integer);

-- ---------- Rank: tables and columns ----------

drop table if exists public.rating_changes;
drop table if exists public.player_ranks;
drop table if exists public.rank_rewards;

alter table public.game_rooms drop column if exists ranked;

-- The public view reads the rank columns, so it is rebuilt without them (same grants as before).
drop view if exists public.leaderboard_profiles;
alter table public.profiles drop column if exists rank_name;
alter table public.profiles drop column if exists rank_points;
create view public.leaderboard_profiles
with (security_barrier = true)
as
select id, display_name, avatar_key, wins, total_matches
from public.profiles;
revoke all on public.leaderboard_profiles from public, anon, authenticated;
grant select on public.leaderboard_profiles to anon, authenticated;

alter table public.match_records drop column if exists rp_change;
alter table public.match_records drop column if exists rank_points_before;
alter table public.match_records drop column if exists rank_points_after;

-- ---------- Rank titles ----------

-- They only meant "reached rank N", so they go with the ranks: unworn, unowned, out of the catalogue.
update public.profiles set title_key = null where title_key ~ '^title-(mafia|mono)-[2-9]$';
delete from public.player_items where item_key ~ '^title-(mafia|mono)-[2-9]$';
delete from public.shop_offers where item_key ~ '^title-(mafia|mono)-[2-9]$';
delete from public.shop_items where key ~ '^title-(mafia|mono)-[2-9]$';

-- ---------- Former rank prizes become legacy looks ----------

alter table public.shop_items drop constraint if exists shop_items_source_check;
update public.shop_items set source = 'legacy' where source = 'rank';
alter table public.shop_items add constraint shop_items_source_check check (source in ('shop', 'legacy', 'pass', 'limited'));
-- No running offer may sell one.
delete from public.shop_offers o using public.shop_items s where s.key = o.item_key and s.source = 'legacy';

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
  if item.kind = 'title' then raise exception 'Цолыг худалдаж авах боломжгүй.' using errcode = 'P0001'; end if;
  if item.source <> 'shop' then raise exception 'Энэ гоёл одоогоор худалдаанд гараагүй байна.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_items where user_id = me and item_key = p_key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  balance := public.spend_for_item(me, item);
  insert into public.player_items (user_id, item_key) values (me, p_key);
  return balance;
end;
$$;

create or replace function public.buy_offer(p_offer uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  offer public.shop_offers;
  item public.shop_items;
  cost integer;
  balance integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into offer from public.shop_offers where id = p_offer and now() >= starts_at and now() < ends_at;
  if not found then raise exception 'Энэ санал дууссан байна.' using errcode = 'P0002'; end if;
  select * into item from public.shop_items where key = offer.item_key and active and kind in ('frame', 'nameplate', 'border') and source <> 'legacy';
  if not found then raise exception 'Бараа олдсонгүй.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.player_items where user_id = me and item_key = item.key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  cost := case when public.is_admin() then 0 else offer.price end;
  if offer.currency = 'diamond' then
    update public.profiles set diamonds = diamonds - cost where id = me and diamonds >= cost returning diamonds into balance;
    if not found then raise exception 'Алмаз хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  else
    update public.profiles set coins = coins - cost where id = me and coins >= cost returning coins into balance;
    if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  end if;
  insert into public.player_items (user_id, item_key) values (me, item.key);
  return balance;
end;
$$;

create or replace function public.admin_create_offer(p_item text, p_price integer, p_currency text, p_hours integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  item public.shop_items;
  created uuid;
begin
  select * into item from public.shop_items where key = p_item and active and kind in ('frame', 'nameplate', 'border');
  if not found then raise exception 'Гоёл олдсонгүй.' using errcode = 'P0002'; end if;
  if item.source = 'legacy' then raise exception 'Хуучин шагналыг онцлох санал болгох боломжгүй.' using errcode = 'P0001'; end if;
  if p_currency not in ('coin', 'diamond') then raise exception 'Мөнгөн тэмдэгт буруу байна.' using errcode = '22023'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000 then raise exception 'Үнэ 0-ээс 1,000,000 хүртэл байна.' using errcode = '22023'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 24 * 60 then raise exception 'Хугацаа 1 цагаас 60 хоног хүртэл байна.' using errcode = '22023'; end if;
  insert into public.shop_offers (item_key, price, currency, starts_at, ends_at, auto, created_by)
  values (item.key, p_price, p_currency, now(), now() + make_interval(hours => p_hours), false, me)
  returning id into created;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'offer', item.key, item.name || ' · ' || p_price || case when p_currency = 'diamond' then ' алмаз' else ' зоос' end || ' · ' || p_hours || ' цаг');
  return created;
end;
$$;

create or replace function public.equip_item(p_kind text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  if p_kind not in ('frame', 'title', 'nameplate', 'border') then raise exception 'Төрөл буруу байна.' using errcode = '22023'; end if;
  if p_key is not null and not (
    public.is_admin() and exists (select 1 from public.shop_items si where si.key = p_key and si.kind = p_kind and si.active)
  ) and not exists (
    select 1 from public.player_items pi join public.shop_items si on si.key = pi.item_key
    where pi.user_id = me and pi.item_key = p_key and si.kind = p_kind and si.active
  ) then
    raise exception 'Энэ бараа танд алга.' using errcode = 'P0001';
  end if;
  if p_kind = 'frame' then
    update public.profiles set frame_key = p_key where id = me;
    update public.game_room_players set frame_key = p_key where user_id = me and not is_bot;
  elsif p_kind = 'nameplate' then
    update public.profiles set nameplate_key = p_key where id = me;
    update public.game_room_players set nameplate_key = p_key where user_id = me and not is_bot;
  elsif p_kind = 'border' then
    update public.profiles set border_key = p_key where id = me;
    update public.game_room_players set border_key = p_key where user_id = me and not is_bot;
  else
    update public.profiles set title_key = p_key where id = me;
  end if;
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
  if item.source <> 'shop' then raise exception 'Энэ гоёлыг бэлэглэх боломжгүй.' using errcode = 'P0001'; end if;
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

-- A player's card: the win count, no rank.
create or replace function public.player_card(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  card json;
begin
  if auth.uid() is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select json_build_object(
    'id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'avatar_key', p.avatar_key,
    'frame_key', p.frame_key, 'title_key', p.title_key, 'nameplate_key', p.nameplate_key, 'border_key', p.border_key,
    'total_matches', p.total_matches, 'wins', p.wins, 'win_rate', p.win_rate, 'best_win_streak', p.best_win_streak,
    'created_at', p.created_at,
    'gift_total', (select count(*) from public.gifts g where g.to_user = p.id and exists (select 1 from public.shop_items s where s.key = g.gift_key and s.kind = 'gift')),
    'gifts', coalesce((
      select json_agg(json_build_object('gift_key', g.gift_key, 'count', g.n) order by g.n desc)
      from (select gift_key, count(*) as n from public.gifts where to_user = p.id group by gift_key) g
      join public.shop_items s on s.key = g.gift_key and s.kind = 'gift'
    ), '[]'::json)
  ) into card
  from public.profiles p where p.id = p_user;
  if card is null then raise exception 'Тоглогч олдсонгүй.' using errcode = 'P0002'; end if;
  return card;
end;
$$;
revoke all on function public.player_card(uuid) from public, anon;
grant execute on function public.player_card(uuid) to authenticated;

-- ---------- Match results: win count, coins and Battle Pass XP ----------

/*
 * Records one player's finished game, once per match and player (a repeat call changes nothing).
 *   * Statistics: one more match, a win or a loss, win rate, level and win streaks.
 *   * Coins: 10 for taking part, 30 for a win, at most 500 a day from games.
 *   * Battle Pass XP (while a season runs, see award_pass_xp): 50 for taking part, +50 for a win,
 *     +100 for the first game of the day.
 *   * Leaving a live game early (p_left): it counts as a loss and pays no coins and no XP.
 *   * "A day" is the Ulaanbaatar calendar day for both the coin cap and the Battle Pass daily bonus
 *     (award_pass_xp), so both reset together at local midnight (16:00 UTC).
 * Only the game server (service_role) may call it.
 */
create or replace function public.record_match_result(p_match_id uuid, p_user_id uuid, p_room_code text, p_outcome text, p_left boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
  left_early boolean := coalesce(p_left, false);
  won boolean := p_outcome = 'win' and not coalesce(p_left, false);
  today integer;
  -- Same day as award_pass_xp's first-game bonus.
  local_day date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  coin_gain integer := 0;
  pass_gain integer := 0;
begin
  if p_match_id is null or p_user_id is null then raise exception 'Match and player are required'; end if;
  if p_outcome not in ('win', 'loss') then raise exception 'Unsupported outcome'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return json_build_object('processed', false);
  end if;

  insert into public.match_records (match_id, user_id, outcome, room_code)
  values (p_match_id, p_user_id, case when won then 'win' else 'loss' end, p_room_code)
  on conflict (match_id, user_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return json_build_object('processed', false); end if;

  if not left_early then
    coin_gain := case when won then 30 else 10 end;
  end if;
  select case when p.game_coins_day = local_day then p.game_coins_today else 0 end into today
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
    game_coins_day = local_day,
    game_coins_today = today + coin_gain
  where id = p_user_id;

  pass_gain := public.award_pass_xp(p_user_id, won, left_early);

  update public.match_records set coins_earned = coin_gain where match_id = p_match_id and user_id = p_user_id;
  return json_build_object('processed', true, 'won', won, 'coins', coin_gain, 'pass_xp', pass_gain);
end;
$$;
revoke all on function public.record_match_result(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_match_result(uuid, uuid, text, text, boolean) to service_role;
