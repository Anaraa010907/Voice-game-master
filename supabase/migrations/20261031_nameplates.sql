-- Nameplates: a picture behind the player's name (lobby seats, game rows, profile card).
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('gift', 'frame', 'title', 'nameplate'));

alter table public.profiles add column if not exists nameplate_key text;
alter table public.game_room_players add column if not exists nameplate_key text;

insert into public.shop_items (key, kind, name, description, icon, price, sort) values
  ('plate-ice-crystal', 'nameplate', 'Мөсөн болор', 'Цэнхэр сарнай, болор эрвээхэй, сарны гэрэлтэй хот', '', 1000, 30)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort;

-- New seats copy the player's frame and nameplate.
create or replace function public.seat_frame_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_bot then
    select p.frame_key, p.nameplate_key into new.frame_key, new.nameplate_key from public.profiles p where p.id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.seat_frame_from_profile() from public, anon, authenticated;

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
  if p_kind not in ('frame', 'title', 'nameplate') then raise exception 'Төрөл буруу байна.' using errcode = '22023'; end if;
  if p_key is not null and not exists (
    select 1 from public.player_items pi join public.shop_items si on si.key = pi.item_key
    where pi.user_id = me and pi.item_key = p_key and si.kind = p_kind
  ) then
    raise exception 'Энэ бараа танд алга.' using errcode = 'P0001';
  end if;
  if p_kind = 'frame' then
    update public.profiles set frame_key = p_key where id = me;
    update public.game_room_players set frame_key = p_key where user_id = me and not is_bot;
  elsif p_kind = 'nameplate' then
    update public.profiles set nameplate_key = p_key where id = me;
    update public.game_room_players set nameplate_key = p_key where user_id = me and not is_bot;
  else
    update public.profiles set title_key = p_key where id = me;
  end if;
end;
$$;
revoke all on function public.equip_item(text, text) from public, anon;
grant execute on function public.equip_item(text, text) to authenticated;

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
    'frame_key', p.frame_key, 'title_key', p.title_key, 'nameplate_key', p.nameplate_key,
    'rank_name', p.rank_name, 'rank_points', p.rank_points,
    'total_matches', p.total_matches, 'wins', p.wins, 'win_rate', p.win_rate, 'best_win_streak', p.best_win_streak,
    'created_at', p.created_at,
    'gift_total', (select count(*) from public.gifts where to_user = p.id),
    'gifts', coalesce((
      select json_agg(json_build_object('gift_key', g.gift_key, 'count', g.n) order by g.n desc)
      from (select gift_key, count(*) as n from public.gifts where to_user = p.id group by gift_key) g
    ), '[]'::json)
  ) into card
  from public.profiles p where p.id = p_user;
  if card is null then raise exception 'Тоглогч олдсонгүй.' using errcode = 'P0002'; end if;
  return card;
end;
$$;
revoke all on function public.player_card(uuid) from public, anon;
grant execute on function public.player_card(uuid) to authenticated;
