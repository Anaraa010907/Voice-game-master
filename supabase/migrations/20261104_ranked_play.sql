-- Ranked play: Mafia and the board game each keep their own rank (see supabase/functions/_shared/ranks.ts).
alter table public.game_rooms add column if not exists ranked boolean not null default false;
alter table public.rating_changes add column if not exists game_type text;
alter table public.rating_changes add column if not exists room_code text;
create index if not exists rating_changes_room on public.rating_changes (room_code, user_id);

create table if not exists public.player_ranks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_type text not null check (game_type in ('mafia', 'monopoly')),
  points integer not null default 0 check (points >= 0),
  peak_points integer not null default 0 check (peak_points >= 0),
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type)
);
create index if not exists player_ranks_board on public.player_ranks (game_type, points desc, wins desc);
alter table public.player_ranks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_ranks' and policyname = 'Ranks are public') then
    create policy "Ranks are public" on public.player_ranks for select to anon, authenticated using (true);
  end if;
end $$;
revoke all on public.player_ranks from anon, authenticated;
grant select on public.player_ranks to anon, authenticated;

-- Mirrors RANK_THRESHOLDS.
create or replace function public.rank_level(p_points integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_points >= 2600 then 9 when p_points >= 1900 then 8 when p_points >= 1400 then 7
    when p_points >= 1000 then 6 when p_points >= 700 then 5 when p_points >= 450 then 4
    when p_points >= 250 then 3 when p_points >= 100 then 2 else 1
  end;
$$;
-- One title for every rank from the second up (names mirror RANK_NAMES).
insert into public.shop_items (key, kind, name, description, icon, price, sort, active) values
  ('title-mafia-2', 'title', 'Гудамжны хүү', 'Мафийн рэйтинг · 100 оноо', '', 0, 102, true),
  ('title-mafia-3', 'title', 'Туслах', 'Мафийн рэйтинг · 250 оноо', '', 0, 103, true),
  ('title-mafia-4', 'title', 'Цэрэг', 'Мафийн рэйтинг · 450 оноо', '', 0, 104, true),
  ('title-mafia-5', 'title', 'Капо', 'Мафийн рэйтинг · 700 оноо', '', 0, 105, true),
  ('title-mafia-6', 'title', 'Зөвлөх', 'Мафийн рэйтинг · 1000 оноо', '', 0, 106, true),
  ('title-mafia-7', 'title', 'Баруун гар', 'Мафийн рэйтинг · 1400 оноо', '', 0, 107, true),
  ('title-mafia-8', 'title', 'Дон', 'Мафийн рэйтинг · 1900 оноо', '', 0, 108, true),
  ('title-mafia-9', 'title', 'Мафийн домог', 'Мафийн рэйтинг · 2600 оноо', '', 0, 109, true),
  ('title-mono-2', 'title', 'Наймаачин', 'Монополийн рэйтинг · 100 оноо', '', 0, 112, true),
  ('title-mono-3', 'title', 'Худалдаачин', 'Монополийн рэйтинг · 250 оноо', '', 0, 113, true),
  ('title-mono-4', 'title', 'Газрын эзэн', 'Монополийн рэйтинг · 450 оноо', '', 0, 114, true),
  ('title-mono-5', 'title', 'Банкир', 'Монополийн рэйтинг · 700 оноо', '', 0, 115, true),
  ('title-mono-6', 'title', 'Хөрөнгөтөн', 'Монополийн рэйтинг · 1000 оноо', '', 0, 116, true),
  ('title-mono-7', 'title', 'Магнат', 'Монополийн рэйтинг · 1400 оноо', '', 0, 117, true),
  ('title-mono-8', 'title', 'Тэрбумтан', 'Монополийн рэйтинг · 1900 оноо', '', 0, 118, true),
  ('title-mono-9', 'title', 'Монополийн хаан', 'Монополийн рэйтинг · 2600 оноо', '', 0, 119, true)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort, active = excluded.active;

-- The shop no longer sells titles.
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
  cost integer;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  select * into item from public.shop_items where key = p_key and active;
  if not found then raise exception 'Бараа олдсонгүй.' using errcode = 'P0002'; end if;
  if item.kind = 'gift' then raise exception 'Бэлгийг тоглолтын үеэр тоглогч дээр дарж илгээнэ.' using errcode = 'P0001'; end if;
  if item.kind = 'title' then raise exception 'Цолыг рэйтинг тоглолтод хожиж авна.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_items where user_id = me and item_key = p_key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  cost := case when public.is_admin() then 0 else item.price end;
  update public.profiles set coins = coins - cost where id = me and coins >= cost returning coins into balance;
  if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  insert into public.player_items (user_id, item_key) values (me, p_key);
  return balance;
end;
$$;

-- Titles are earned in ranked play and no longer sold: bought titles are refunded, taken off and retired.
update public.profiles p set coins = p.coins + refund.total
from (
  select pi.user_id, sum(s.price)::integer as total
  from public.player_items pi join public.shop_items s on s.key = pi.item_key
  where s.key in ('title-shadow', 'title-detective', 'title-tycoon', 'title-don', 'title-legend')
  group by pi.user_id
) refund
where p.id = refund.user_id;
update public.profiles set title_key = null
  where title_key in ('title-shadow', 'title-detective', 'title-tycoon', 'title-don', 'title-legend');
update public.shop_items set active = false
  where key in ('title-shadow', 'title-detective', 'title-tycoon', 'title-don', 'title-legend');
-- One finished game for one player, called only by the game server. Idempotent per match and player.
-- Every game counts in the profile statistics; ranked games also move the game's rank and unlock titles.
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
  rank_row public.player_ranks;
  old_points integer;
  new_points integer;
  old_level integer;
  new_level integer;
  title_prefix text := case p_game_type when 'mafia' then 'title-mafia-' else 'title-mono-' end;
begin
  if p_outcome not in ('win', 'loss') then raise exception 'Unsupported outcome'; end if;
  if p_game_type not in ('mafia', 'monopoly') then raise exception 'Unsupported game'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return json_build_object('processed', false);
  end if;

  insert into public.match_records (match_id, user_id, outcome, rp_change, rank_points_before, rank_points_after)
  values (p_match_id, p_user_id, p_outcome, 0, 0, 0)
  on conflict (match_id, user_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return json_build_object('processed', false); end if;

  update public.profiles set
    total_matches = total_matches + 1,
    wins = wins + case when won then 1 else 0 end,
    losses = losses + case when won then 0 else 1 end,
    win_rate = round(((wins + case when won then 1 else 0 end)::numeric / (total_matches + 1)) * 100, 2),
    player_level = greatest(1, ceil((total_matches + 1)::numeric / 5)::integer),
    current_win_streak = case when won then current_win_streak + 1 else 0 end,
    best_win_streak = greatest(best_win_streak, case when won then current_win_streak + 1 else 0 end)
  where id = p_user_id;

  if not coalesce(p_ranked, false) then return json_build_object('processed', true, 'ranked', false); end if;

  insert into public.player_ranks (user_id, game_type) values (p_user_id, p_game_type) on conflict do nothing;
  select * into rank_row from public.player_ranks where user_id = p_user_id and game_type = p_game_type for update;
  old_points := rank_row.points;
  new_points := greatest(0, old_points + greatest(-40, least(60, coalesce(p_delta, 0))));
  old_level := public.rank_level(old_points);
  new_level := public.rank_level(new_points);

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

  update public.match_records set rp_change = new_points - old_points, rank_points_before = old_points, rank_points_after = new_points
  where match_id = p_match_id and user_id = p_user_id;
  insert into public.rating_changes (match_id, user_id, outcome, rp_change, rank_points_before, rank_points_after, previous_rank, new_rank, game_type, room_code)
  values (p_match_id, p_user_id, p_outcome, new_points - old_points, old_points, new_points, old_level::text, new_level::text, p_game_type, p_room_code)
  on conflict (match_id, user_id) do nothing;

  -- Every rank reached unlocks its title for good.
  if new_level >= 2 then
    insert into public.player_items (user_id, item_key)
    select p_user_id, title_prefix || lvl from generate_series(2, new_level) as lvl
    on conflict do nothing;
  end if;

  return json_build_object('processed', true, 'ranked', true, 'before', old_points, 'after', new_points, 'level_before', old_level, 'level_after', new_level);
end;
$$;

-- Only items still on offer can be worn (the retired bought titles cannot be put back on).
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
  if p_key is not null and not exists (
    select 1 from public.player_items pi join public.shop_items si on si.key = pi.item_key
    where pi.user_id = me and pi.item_key = p_key and si.kind = p_kind and si.active
  ) then
    raise exception using errcode = 'P0001', message = case when p_kind = 'title' then 'Энэ цолыг рэйтинг тоглолтод хожиж авна.' else 'Энэ бараа танд алга.' end;
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

revoke all on function public.rank_level(integer) from public, anon, authenticated;
revoke all on function public.record_game_result(uuid, uuid, text, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.record_game_result(uuid, uuid, text, text, text, boolean, integer) to service_role;
revoke all on function public.equip_item(text, text) from public, anon;
grant execute on function public.equip_item(text, text) to authenticated;
-- Top players of one game's ranking.
create or replace function public.rank_leaderboard(p_game text, p_limit integer default 20)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select r.user_id as id, p.display_name, p.avatar_url, p.avatar_key, p.frame_key, p.title_key, p.player_no,
      r.points, r.wins, r.matches, public.rank_level(r.points) as level
    from public.player_ranks r join public.profiles p on p.id = r.user_id
    where r.game_type = p_game and r.matches > 0
    order by r.points desc, r.wins desc, r.updated_at asc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) t;
$$;

-- The player card also shows both ranks.
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
    'rank_name', p.rank_name, 'rank_points', p.rank_points,
    'total_matches', p.total_matches, 'wins', p.wins, 'win_rate', p.win_rate, 'best_win_streak', p.best_win_streak,
    'created_at', p.created_at,
    'ranks', coalesce((select json_agg(json_build_object('game_type', r.game_type, 'points', r.points, 'wins', r.wins, 'matches', r.matches))
      from public.player_ranks r where r.user_id = p.id), '[]'::json),
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

revoke all on function public.rank_leaderboard(text, integer), public.player_card(uuid) from public, anon;
grant execute on function public.rank_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.player_card(uuid) to authenticated;
