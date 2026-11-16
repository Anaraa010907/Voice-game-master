-- Profile backdrops («Профайлын дэвсгэр»): a painted picture filling the big portrait card behind the
-- avatar on the profile screen, and behind the avatar on the player card others open. A new look kind
-- ('backdrop') beside avatar frames, nameplates and name borders, handled exactly like them:
--   * sold in the shop for diamonds (painted art, see 20261111_cosmetic_tiers), bought with buy_item;
--   * worn and taken off with equip_item (profiles.backdrop_key);
--   * given to a friend with send_friend_gift (not during a match, like frames);
--   * put on «Онцлох» offers by an admin and picked by the weekly rotation;
--   * usable as a Battle Pass reward (pass_rewards.item_key takes any shop item; claim_pass_reward
--     already handles every look kind).
-- Only the profile and the player card show it, so it is not copied onto room seats
-- (game_room_players and the seat_frame_from_profile trigger stay as they are).
--
-- The functions below are the 20261117 (and, for rotate_shop_offers, 20261112) bodies with only
-- 'backdrop' added to their kind lists, plus equip_item's backdrop branch and player_card's
-- backdrop_key.
--
-- Idempotent: every step can run again on an already migrated database.

-- ---------- The kind and the profile column ----------

alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check
  check (kind in ('gift', 'frame', 'title', 'nameplate', 'border', 'backdrop'));

-- Like frame_key, nameplate_key and border_key: plain text, set only through equip_item (players can
-- update only display_name, avatar_key and avatar_url themselves).
alter table public.profiles add column if not exists backdrop_key text;

-- ---------- The six backdrops ----------

-- Painted art, so diamonds. Each backdrop matches a painted look and costs at least as much, being
-- the biggest picture: frame-ice-butterfly 60 -> 80, frame-rainy-night 70 -> 80, plate-casino 70 -> 100,
-- frame-blood-rose 110 -> 110, frame-fire-dragon 80 -> 120, frame-eagle-crown 120 -> gold crown 150
-- (the royal one, at the top of the painted range like frame-shadow-don).
-- Pictures: public/assets/showcases/<name>.webp, mapped in src/backdrops.ts (BACKDROP_IMAGES).
-- A row that already exists keeps its price, purse, source and active flag (an admin may have changed
-- them); its names and description are refreshed.
insert into public.shop_items (key, kind, name, description, name_en, description_en, icon, price, sort, active, currency, source) values
  ('backdrop-ice-butterfly', 'backdrop', 'Мөсөн эрвээхэй', 'Цэнхэр сарнай, мөсөн болор, гэрэлтэх эрвээхэй',
    'Ice butterfly', 'Blue roses, ice crystals and glowing butterflies', '', 80, 400, true, 'diamond', 'shop'),
  ('backdrop-rainy-night', 'backdrop', 'Бороотой шөнө', 'Хийн дэнлүү, бороо, шөнийн хот, нойтон чулуун зам',
    'Rainy night', 'A gas lamp, rain, the night city and wet cobblestones', '', 80, 401, true, 'diamond', 'shop'),
  ('backdrop-casino', 'backdrop', 'Казино', 'Покерын чип, хөзөр, рулет, ногоон даавуу',
    'Casino', 'Poker chips, cards, roulette and green felt', '', 100, 402, true, 'diamond', 'shop'),
  ('backdrop-blood-rose', 'backdrop', 'Цуст сарнай', 'Улаан сарнай, мөнгөн өргөст ороонго, цуст сар',
    'Blood rose', 'Red roses, silver thorned vines and a blood moon', '', 110, 403, true, 'diamond', 'shop'),
  ('backdrop-fire-dragon', 'backdrop', 'Галт луу', 'Дүрэлзэх луу, гал, утаа',
    'Fire dragon', 'A blazing dragon, flames and smoke', '', 120, 404, true, 'diamond', 'shop'),
  ('backdrop-gold-crown', 'backdrop', 'Алтан титэм', 'Алтан титэм, алтан хээ, улаан хилэн',
    'Golden crown', 'A golden crown, gilded scrollwork and red velvet', '', 150, 405, true, 'diamond', 'shop')
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  name_en = excluded.name_en, description_en = excluded.description_en, icon = excluded.icon, sort = excluded.sort;

-- ---------- Wear / take off ----------

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
  if p_kind not in ('frame', 'title', 'nameplate', 'border', 'backdrop') then raise exception 'Төрөл буруу байна.' using errcode = '22023'; end if;
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
  elsif p_kind = 'backdrop' then
    -- Shown on the profile and the player card only, so no seat copy.
    update public.profiles set backdrop_key = p_key where id = me;
  else
    update public.profiles set title_key = p_key where id = me;
  end if;
end;
$$;
revoke all on function public.equip_item(text, text) from public, anon;
grant execute on function public.equip_item(text, text) to authenticated;

-- ---------- A player's card: now with the backdrop ----------

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
    'backdrop_key', p.backdrop_key,
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

-- ---------- Offers ----------

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
  select * into item from public.shop_items where key = offer.item_key and active and kind in ('frame', 'nameplate', 'border', 'backdrop') and source <> 'legacy';
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
revoke all on function public.buy_offer(uuid) from public, anon;
grant execute on function public.buy_offer(uuid) to authenticated;

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
  select * into item from public.shop_items where key = p_item and active and kind in ('frame', 'nameplate', 'border', 'backdrop');
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
revoke all on function public.admin_create_offer(text, integer, text, integer) from public, anon;
grant execute on function public.admin_create_offer(text, integer, text, integer) to authenticated;

-- The weekly offer (pg_cron 'rotate-shop-offers', unchanged) may now pick a backdrop too.
create or replace function public.rotate_shop_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_end timestamptz := (date_trunc('week', now() at time zone 'Asia/Ulaanbaatar') + interval '7 days') at time zone 'Asia/Ulaanbaatar';
  added integer;
begin
  if exists (select 1 from public.shop_offers where auto and ends_at > now()) then return 0; end if;
  if week_end - now() < interval '2 days' then week_end := week_end + interval '7 days'; end if;
  insert into public.shop_offers (item_key, price, currency, starts_at, ends_at, auto)
  select si.key, greatest(1, round(si.price * 0.8))::integer, si.currency, now(), week_end, true
  from public.shop_items si
  where si.active and si.currency = 'diamond' and si.source in ('shop', 'limited') and si.kind in ('frame', 'nameplate', 'border', 'backdrop')
    and si.key not in (select o.item_key from public.shop_offers o where o.auto and o.ends_at > now() - interval '8 days')
  order by random()
  limit 2;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.rotate_shop_offers() from public, anon, authenticated;

-- ---------- Gifts to friends ----------

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
  select * into item from public.shop_items where key = p_key and active and kind in ('gift', 'frame', 'nameplate', 'border', 'backdrop');
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
revoke all on function public.send_friend_gift(uuid, text) from public, anon;
grant execute on function public.send_friend_gift(uuid, text) to authenticated;
