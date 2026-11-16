-- Shop, cosmetics (animated avatar frames, titles), in-game gifts and player reports.
-- Example economy for now: every account starts with 1000 coins and can claim 100 a day.
-- Coins only change through the checked functions below; players cannot write them.

alter table public.profiles add column if not exists coins integer not null default 1000;
alter table public.profiles add column if not exists frame_key text;
alter table public.profiles add column if not exists title_key text;
alter table public.profiles add column if not exists bonus_claimed_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_coins_not_negative check (coins >= 0);
exception when duplicate_object then null; end $$;

-- Seats carry the frame so everyone at the table sees it.
alter table public.game_room_players add column if not exists frame_key text;

create table if not exists public.shop_items (
  key text primary key check (key ~ '^[a-z0-9-]{2,32}$'),
  kind text not null check (kind in ('gift', 'frame', 'title')),
  name text not null,
  description text not null default '',
  icon text not null default '',
  price integer not null check (price >= 0),
  sort integer not null default 0,
  active boolean not null default true
);

insert into public.shop_items (key, kind, name, description, icon, price, sort) values
  ('gift-rose', 'gift', 'Сарнай', 'Энгийн ч сэтгэлтэй бэлэг', '🌹', 10, 1),
  ('gift-coffee', 'gift', 'Кофе', 'Шөнийн ярианд сэргэлэн байлга', '☕', 20, 2),
  ('gift-clover', 'gift', 'Азын навч', 'Дараагийн шоонд аз хүс', '🍀', 30, 3),
  ('gift-cake', 'gift', 'Бялуу', 'Ялалтаа тэмдэглэ', '🎂', 50, 4),
  ('gift-hat', 'gift', 'Мафи малгай', 'Жинхэнэ дон шиг', '🎩', 80, 5),
  ('gift-diamond', 'gift', 'Алмаз', 'Гялалзсан хүндэтгэл', '💎', 150, 6),
  ('gift-crown', 'gift', 'Титэм', 'Ширээний хаан', '👑', 300, 7),
  ('gift-car', 'gift', 'Спорт машин', 'Хамгийн том бэлэг', '🏎️', 500, 8),
  ('frame-gold', 'frame', 'Алтан цагираг', 'Эргэлдэх алтан гэрэлтэй хүрээ', '', 300, 10),
  ('frame-neon', 'frame', 'Неон', 'Шөнийн хотын неон гэрэл', '', 400, 11),
  ('frame-ice', 'frame', 'Мөсөн', 'Гялтганах хүйтэн мөс', '', 500, 12),
  ('frame-fire', 'frame', 'Галт цагираг', 'Дүрэлзэх гал', '', 700, 13),
  ('frame-blood', 'frame', 'Цуст сар', 'Тойрон эргэх улаан сар', '', 900, 14),
  ('frame-royal', 'frame', 'Хааны', 'Солонгон гэрэл, оч бүхий хүрээ', '', 1500, 15),
  ('title-shadow', 'title', 'Сүүдрийн хүн', 'Профайл дээр харагдах цол', '', 200, 20),
  ('title-detective', 'title', 'Нууц мөрдөгч', 'Профайл дээр харагдах цол', '', 300, 21),
  ('title-tycoon', 'title', 'Газрын эзэн', 'Профайл дээр харагдах цол', '', 400, 22),
  ('title-don', 'title', 'Хотын эзэн', 'Профайл дээр харагдах цол', '', 600, 23),
  ('title-legend', 'title', 'Домогт тоглогч', 'Профайл дээр харагдах цол', '', 1000, 24)
on conflict (key) do update set kind = excluded.kind, name = excluded.name, description = excluded.description,
  icon = excluded.icon, price = excluded.price, sort = excluded.sort;

create table if not exists public.player_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_key text not null references public.shop_items (key),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- Gifts stay after the room is gone, so a profile can show what it received.
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  room_code text not null,
  from_user uuid references auth.users (id) on delete set null,
  to_user uuid not null references auth.users (id) on delete cascade,
  from_name text not null,
  to_name text not null,
  gift_key text not null references public.shop_items (key),
  created_at timestamptz not null default now()
);
create index if not exists gifts_room_created on public.gifts (room_code, created_at desc);
create index if not exists gifts_to_user on public.gifts (to_user);
create index if not exists gifts_from_created on public.gifts (from_user, created_at desc);

-- Reports are feedback rows that also name the player and the room.
alter table public.feedback add column if not exists target_user uuid references auth.users (id) on delete set null;
alter table public.feedback add column if not exists room_code text;

alter table public.shop_items enable row level security;
alter table public.player_items enable row level security;
alter table public.gifts enable row level security;
revoke all on public.shop_items, public.player_items, public.gifts from public, anon, authenticated;
grant all on public.shop_items, public.player_items, public.gifts to service_role;
grant select on public.shop_items to anon, authenticated;
grant select on public.player_items, public.gifts to authenticated;

drop policy if exists "Everyone reads the shop" on public.shop_items;
create policy "Everyone reads the shop" on public.shop_items for select to anon, authenticated using (active);
drop policy if exists "Players read their own items" on public.player_items;
create policy "Players read their own items" on public.player_items for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Room members see the room's gifts" on public.gifts;
create policy "Room members see the room's gifts" on public.gifts for select to authenticated using (public.is_game_room_member(room_code));

-- Everyone at the table receives each gift live.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gifts') then
    alter publication supabase_realtime add table public.gifts;
  end if;
end $$;

-- New seats copy the player's frame.
create or replace function public.seat_frame_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_bot then
    select p.frame_key into new.frame_key from public.profiles p where p.id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.seat_frame_from_profile() from public, anon, authenticated;
create or replace trigger seat_frame_from_profile
  before insert on public.game_room_players
  for each row execute function public.seat_frame_from_profile();

-- ---------- shop ----------

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
  if exists (select 1 from public.player_items where user_id = me and item_key = p_key) then
    raise exception 'Энэ бараа танд аль хэдийн байгаа.' using errcode = 'P0001';
  end if;
  update public.profiles set coins = coins - item.price where id = me and coins >= item.price returning coins into balance;
  if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  insert into public.player_items (user_id, item_key) values (me, p_key);
  return balance;
end;
$$;

-- p_key null takes the frame or title off.
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
  if p_kind not in ('frame', 'title') then raise exception 'Төрөл буруу байна.' using errcode = '22023'; end if;
  if p_key is not null and not exists (
    select 1 from public.player_items pi join public.shop_items si on si.key = pi.item_key
    where pi.user_id = me and pi.item_key = p_key and si.kind = p_kind
  ) then
    raise exception 'Энэ бараа танд алга.' using errcode = 'P0001';
  end if;
  if p_kind = 'frame' then
    update public.profiles set frame_key = p_key where id = me;
    update public.game_room_players set frame_key = p_key where user_id = me and not is_bot;
  else
    update public.profiles set title_key = p_key where id = me;
  end if;
end;
$$;

create or replace function public.claim_daily_bonus()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  balance integer;
  claimed timestamptz;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  update public.profiles set coins = coins + 100, bonus_claimed_at = now()
  where id = me and (bonus_claimed_at is null or bonus_claimed_at < now() - interval '20 hours')
  returning coins into balance;
  if not found then
    select bonus_claimed_at into claimed from public.profiles where id = me;
    raise exception 'Өдрийн бонусыг % цагийн дараа дахин авна.',
      greatest(1, ceil(extract(epoch from (claimed + interval '20 hours' - now())) / 3600))::integer using errcode = 'P0001';
  end if;
  return balance;
end;
$$;

-- ---------- table ----------

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
  update public.profiles set coins = coins - item.price where id = me and coins >= item.price returning coins into balance;
  if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  insert into public.gifts (room_code, from_user, to_user, from_name, to_name, gift_key)
  values (p_room, me, p_to, sender_name, receiver_name, p_gift);
  return balance;
end;
$$;

-- What another player sees when they tap you.
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
    'frame_key', p.frame_key, 'title_key', p.title_key, 'rank_name', p.rank_name, 'rank_points', p.rank_points,
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

create or replace function public.report_player(p_target uuid, p_room text, p_reason text, p_message text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 60);
  note text := nullif(trim(coalesce(p_message, '')), '');
  new_id bigint;
begin
  if me is null then raise exception 'Нэвтэрнэ үү.' using errcode = '42501'; end if;
  if p_target = me then raise exception 'Өөрийгөө мэдээлэх боломжгүй.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'Тоглогч олдсонгүй.' using errcode = 'P0002'; end if;
  if (select count(*) from public.feedback where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Өдөрт 10-аас олон санал, гомдол илгээх боломжгүй.' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, category, message, target_user, room_code)
  values (me, 'report', left('[' || coalesce(reason, 'Бусад') || ']' || coalesce(' ' || note, ''), 1000), p_target, nullif(trim(coalesce(p_room, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

-- The admin inbox, now with the reported player and room.
create or replace function public.admin_feedback_inbox(p_status text default 'open', p_limit integer default 80)
returns table (
  id bigint, user_id uuid, display_name text, avatar_url text, category text, message text,
  status text, admin_reply text, replied_at timestamptz, created_at timestamptz,
  target_user uuid, target_name text, room_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select f.id, f.user_id, coalesce(p.display_name, 'Тоглогч'), p.avatar_url, f.category, f.message,
    f.status, f.admin_reply, f.replied_at, f.created_at, f.target_user, t.display_name, f.room_code
  from public.feedback f
  left join public.profiles p on p.id = f.user_id
  left join public.profiles t on t.id = f.target_user
  where p_status = 'all' or f.status = p_status
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
end;
$$;

revoke all on function public.buy_item(text), public.equip_item(text, text), public.claim_daily_bonus(),
  public.send_gift(text, uuid, text), public.player_card(uuid), public.report_player(uuid, text, text, text),
  public.admin_feedback_inbox(text, integer) from public, anon;
grant execute on function public.buy_item(text), public.equip_item(text, text), public.claim_daily_bonus(),
  public.send_gift(text, uuid, text), public.player_card(uuid), public.report_player(uuid, text, text, text),
  public.admin_feedback_inbox(text, integer) to authenticated;
