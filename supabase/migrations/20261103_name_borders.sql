-- Name borders: a shining animated border around the player's row (lobby seat, game card, board row, profile).
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('gift', 'frame', 'title', 'nameplate', 'border'));

alter table public.profiles add column if not exists border_key text;
alter table public.game_room_players add column if not exists border_key text;

insert into public.shop_items (key, kind, name, description, icon, price, sort) values
  ('border-gold', 'border', 'Алтан гялбаа', 'Нэрийн мөрийг тойрох алтан гэрэл', '', 400, 40),
  ('border-neon', 'border', 'Неон туяа', 'Ягаан, цэнхэр неон гэрэл эргэлдэнэ', '', 500, 41),
  ('border-ice', 'border', 'Мөсөн гялаа', 'Хүйтэн цэнхэр гялтгар', '', 600, 42),
  ('border-fire', 'border', 'Галт туяа', 'Дүрэлзэх улбар шар гал', '', 800, 43),
  ('border-ruby', 'border', 'Бадмаараг', 'Улаан эрдэнийн гялбаа', '', 900, 44),
  ('border-royal', 'border', 'Солонгон хаан', 'Солонгон өнгө, хурдан эргэх гэрэл', '', 1500, 45)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort;

create or replace function public.seat_frame_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_bot then
    select p.frame_key, p.nameplate_key, p.border_key into new.frame_key, new.nameplate_key, new.border_key
    from public.profiles p where p.id = new.user_id;
  end if;
  return new;
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
  elsif p_kind = 'border' then
    update public.profiles set border_key = p_key where id = me;
    update public.game_room_players set border_key = p_key where user_id = me and not is_bot;
  else
    update public.profiles set title_key = p_key where id = me;
  end if;
end;
$$;

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

-- Friends may also gift name borders (outside a game).
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
  cost integer;
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
  cost := case when public.is_admin() then 0 else item.price end;
  update public.profiles set coins = coins - cost where id = me and coins >= cost returning coins, display_name into balance, sender_name;
  if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  select display_name into receiver_name from public.profiles where id = p_to;
  if item.kind <> 'gift' then
    insert into public.player_items (user_id, item_key) values (p_to, p_key);
  end if;
  insert into public.gifts (room_code, from_user, to_user, from_name, to_name, gift_key) values ('DM', me, p_to, sender_name, receiver_name, p_key);
  insert into public.direct_messages (sender, recipient, kind, body, gift_key) values (me, p_to, 'gift', item.name, p_key);
  return balance;
end;
$$;

revoke all on function public.seat_frame_from_profile() from public, anon, authenticated;
revoke all on function public.equip_item(text, text), public.player_card(uuid), public.send_friend_gift(uuid, text) from public, anon;
grant execute on function public.equip_item(text, text), public.player_card(uuid), public.send_friend_gift(uuid, text) to authenticated;
