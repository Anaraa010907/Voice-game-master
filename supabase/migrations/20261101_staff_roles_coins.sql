-- Staff roles (admin / moderator), coin grants, free shopping for admins, and admins watching live rooms.
-- Moderators: dashboard, reports/feedback and bans. Admins: everything.

alter table public.admin_users add column if not exists role text not null default 'admin';
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'moderator'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'admin');
$$;

-- 'admin', 'moderator' or null.
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.admin_users where user_id = (select auth.uid());
$$;

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.admin_users where user_id = me and role = 'admin') then
    raise exception 'Зөвхөн админ хийх боломжтой.' using errcode = '42501';
  end if;
  return me;
end;
$$;

create or replace function public.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.admin_users where user_id = me) then
    raise exception 'Зөвхөн админ, модератор хийх боломжтой.' using errcode = '42501';
  end if;
  return me;
end;
$$;

-- ---------- moderators may read the dashboard, players and the inbox ----------

create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return json_build_object(
    'players', (select count(*) from public.profiles),
    'new_today', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
    'rooms_live', (select count(*) from public.game_rooms where status in ('lobby', 'playing')),
    'rooms_playing', (select count(*) from public.game_rooms where status = 'playing'),
    'open_feedback', (select count(*) from public.feedback where status = 'open'),
    'banned', (select count(*) from public.player_bans where banned_until is null or banned_until > now())
  );
end;
$$;

-- Replaces admin_list_players (which stays admin-only and unused): adds coins and staff role, hides e-mail from moderators.
create or replace function public.admin_find_players(p_search text default '', p_limit integer default 60)
returns table (
  id uuid, display_name text, avatar_url text, email text, provider text,
  created_at timestamptz, last_sign_in_at timestamptz, total_matches integer, wins integer, coins integer,
  staff_role text, is_banned boolean, banned_until timestamptz, ban_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle text := lower(trim(coalesce(p_search, '')));
  full_view boolean;
begin
  perform public.require_staff();
  full_view := public.is_admin();
  return query
  select p.id, p.display_name, p.avatar_url,
    case when full_view then u.email::text end,
    coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
    p.created_at, u.last_sign_in_at, p.total_matches, p.wins, p.coins,
    a.role,
    (b.user_id is not null and (b.banned_until is null or b.banned_until > now())),
    b.banned_until, b.reason
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.admin_users a on a.user_id = p.id
  left join public.player_bans b on b.user_id = p.id
  where needle = ''
    or strpos(lower(p.display_name), needle) > 0
    or (full_view and strpos(lower(coalesce(u.email, '')), needle) > 0)
  order by (a.role is not null) desc, (b.user_id is not null and (b.banned_until is null or b.banned_until > now())) desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
end;
$$;

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
  perform public.require_staff();
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

create or replace function public.admin_reply_feedback(p_id bigint, p_reply text, p_resolve boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_staff();
  reply text := nullif(trim(coalesce(p_reply, '')), '');
begin
  update public.feedback
  set admin_reply = coalesce(left(reply, 1000), admin_reply),
      replied_at = case when reply is null then replied_at else now() end,
      status = case when p_resolve then 'resolved' else 'open' end
  where id = p_id;
  if not found then
    raise exception 'Санал олдсонгүй.' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, case when p_resolve then 'feedback-resolve' else 'feedback-reopen' end, p_id::text, left(reply, 120));
end;
$$;

-- ---------- admin only: coins and roles ----------

create or replace function public.admin_grant_coins(p_user uuid, p_amount integer, p_reason text default '')
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
    raise exception 'Зоосны хэмжээ 1-ээс 1,000,000 хүртэл байна.' using errcode = '22023';
  end if;
  update public.profiles set coins = greatest(0, coins + p_amount) where id = p_user returning coins, display_name into balance, who;
  if not found then raise exception 'Тоглогч олдсонгүй.' using errcode = 'P0002'; end if;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'coins', p_user::text, left(who || ' · ' || case when p_amount > 0 then '+' else '' end || p_amount || coalesce(' · ' || nullif(trim(p_reason), ''), ''), 120));
  return balance;
end;
$$;

-- p_role: 'admin', 'moderator', or null to make them an ordinary player again.
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  who text;
begin
  if p_user = me then raise exception 'Өөрийнхөө эрхийг өөрчлөх боломжгүй.' using errcode = 'P0001'; end if;
  if p_role is not null and p_role not in ('admin', 'moderator') then raise exception 'Эрх буруу байна.' using errcode = '22023'; end if;
  select display_name into who from public.profiles where id = p_user;
  if not found then raise exception 'Тоглогч олдсонгүй.' using errcode = 'P0002'; end if;
  if p_role is null then
    delete from public.admin_users where user_id = p_user;
  else
    insert into public.admin_users (user_id, role) values (p_user, p_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
  insert into public.admin_actions (admin_id, action, target, detail)
  values (me, 'role', p_user::text, left(who || ' · ' || coalesce(case p_role when 'admin' then 'Админ' else 'Модератор' end, 'Энгийн тоглогч'), 120));
end;
$$;

-- ---------- admins shop for free ----------

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
  cost integer;
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
  cost := case when public.is_admin() then 0 else item.price end;
  update public.profiles set coins = coins - cost where id = me and coins >= cost returning coins into balance;
  if not found then raise exception 'Зоос хүрэлцэхгүй байна.' using errcode = 'P0001'; end if;
  insert into public.gifts (room_code, from_user, to_user, from_name, to_name, gift_key)
  values (p_room, me, p_to, sender_name, receiver_name, p_gift);
  return balance;
end;
$$;

-- ---------- admins watch any room ----------

drop policy if exists "Admins read all rooms" on public.game_rooms;
create policy "Admins read all rooms" on public.game_rooms for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admins read all seats" on public.game_room_players;
create policy "Admins read all seats" on public.game_room_players for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admins read all public views" on public.game_public;
create policy "Admins read all public views" on public.game_public for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admins see all gifts" on public.gifts;
create policy "Admins see all gifts" on public.gifts for select to authenticated using ((select public.is_admin()));

revoke all on function public.require_admin(), public.require_staff() from public, anon, authenticated;
revoke all on function public.staff_role(), public.admin_stats(), public.admin_find_players(text, integer), public.admin_feedback_inbox(text, integer),
  public.admin_reply_feedback(bigint, text, boolean), public.admin_grant_coins(uuid, integer, text), public.admin_set_role(uuid, text),
  public.buy_item(text), public.send_gift(text, uuid, text) from public, anon;
grant execute on function public.staff_role(), public.admin_stats(), public.admin_find_players(text, integer), public.admin_feedback_inbox(text, integer),
  public.admin_reply_feedback(bigint, text, boolean), public.admin_grant_coins(uuid, integer, text), public.admin_set_role(uuid, text),
  public.buy_item(text), public.send_gift(text, uuid, text) to authenticated;
revoke execute on function public.admin_list_players(text, integer) from authenticated;
