-- Admin tools: admins, player bans, a feedback inbox, a menu announcement and an audit log.
-- Players never write these tables directly. Reads and simple writes go through the checked
-- functions below; bans and room closing go through the `game` Edge Function (it can end a
-- banned player's seat properly and sets the Supabase Auth ban).

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.player_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  -- null means permanent
  banned_until timestamptz,
  banned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('idea', 'bug', 'report', 'other')),
  message text not null check (char_length(message) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 1000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists feedback_status_created on public.feedback (status, created_at desc);
create index if not exists feedback_user_created on public.feedback (user_id, created_at desc);

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 1 and 200),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_created on public.admin_actions (created_at desc);

alter table public.admin_users enable row level security;
alter table public.player_bans enable row level security;
alter table public.feedback enable row level security;
alter table public.announcements enable row level security;
alter table public.admin_actions enable row level security;

revoke all on public.admin_users, public.player_bans, public.feedback, public.announcements, public.admin_actions from public, anon, authenticated;
grant all on public.admin_users, public.player_bans, public.feedback, public.announcements, public.admin_actions to service_role;

-- A banned player can see their own ban (reason and end), nothing else.
grant select on public.player_bans to authenticated;
drop policy if exists "Players read their own ban" on public.player_bans;
create policy "Players read their own ban" on public.player_bans
for select to authenticated using (user_id = (select auth.uid()));

-- Players read their own messages and the admin's replies.
grant select on public.feedback to authenticated;
drop policy if exists "Players read their own feedback" on public.feedback;
create policy "Players read their own feedback" on public.feedback
for select to authenticated using (user_id = (select auth.uid()));

-- Everyone sees the live announcement on the main menu.
grant select on public.announcements to anon, authenticated;
drop policy if exists "Everyone reads live announcements" on public.announcements;
create policy "Everyone reads live announcements" on public.announcements
for select to anon, authenticated using (active);

-- ---------- helpers ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

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
  if me is null or not exists (select 1 from public.admin_users where user_id = me) then
    raise exception 'Зөвхөн админ хийх боломжтой.' using errcode = '42501';
  end if;
  return me;
end;
$$;
revoke all on function public.require_admin() from public, anon, authenticated;

-- ---------- players ----------

create or replace function public.send_feedback(p_category text, p_message text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  body text := trim(coalesce(p_message, ''));
  new_id bigint;
begin
  if me is null then
    raise exception 'Санал илгээхийн тулд нэвтэрнэ үү.' using errcode = '42501';
  end if;
  if p_category not in ('idea', 'bug', 'report', 'other') then
    raise exception 'Төрөл буруу байна.' using errcode = '22023';
  end if;
  if char_length(body) < 3 then
    raise exception 'Дор хаяж 3 тэмдэгт бичнэ үү.' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Өдөрт 10-аас олон санал илгээх боломжгүй.' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, category, message)
  values (me, p_category, left(body, 1000))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.send_feedback(text, text) from public, anon;
grant execute on function public.send_feedback(text, text) to authenticated;

-- ---------- admin reads ----------

create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
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
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_list_players(p_search text default '', p_limit integer default 60)
returns table (
  id uuid, display_name text, avatar_url text, email text, provider text,
  created_at timestamptz, last_sign_in_at timestamptz, total_matches integer, wins integer,
  is_admin boolean, is_banned boolean, banned_until timestamptz, ban_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle text := lower(trim(coalesce(p_search, '')));
begin
  perform public.require_admin();
  return query
  select p.id, p.display_name, p.avatar_url, u.email::text, coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
    p.created_at, u.last_sign_in_at, p.total_matches, p.wins,
    exists (select 1 from public.admin_users a where a.user_id = p.id),
    (b.user_id is not null and (b.banned_until is null or b.banned_until > now())),
    b.banned_until, b.reason
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.player_bans b on b.user_id = p.id
  where needle = ''
    or strpos(lower(p.display_name), needle) > 0
    or strpos(lower(coalesce(u.email, '')), needle) > 0
  order by (b.user_id is not null and (b.banned_until is null or b.banned_until > now())) desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
end;
$$;
revoke all on function public.admin_list_players(text, integer) from public, anon;
grant execute on function public.admin_list_players(text, integer) to authenticated;

create or replace function public.admin_list_feedback(p_status text default 'open', p_limit integer default 80)
returns table (
  id bigint, user_id uuid, display_name text, avatar_url text, category text, message text,
  status text, admin_reply text, replied_at timestamptz, created_at timestamptz
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
    f.status, f.admin_reply, f.replied_at, f.created_at
  from public.feedback f
  left join public.profiles p on p.id = f.user_id
  where p_status = 'all' or f.status = p_status
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
end;
$$;
revoke all on function public.admin_list_feedback(text, integer) from public, anon;
grant execute on function public.admin_list_feedback(text, integer) to authenticated;

create or replace function public.admin_list_rooms()
returns table (
  room_code text, name text, game_type text, status text, is_private boolean,
  players integer, bots integer, max_players integer, host_name text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select r.room_code, r.name, r.game_type, r.status, r.is_private,
    (select count(*)::integer from public.game_room_players s where s.room_code = r.room_code and not s.is_bot),
    (select count(*)::integer from public.game_room_players s where s.room_code = r.room_code and s.is_bot),
    r.max_players,
    coalesce((select s.display_name from public.game_room_players s where s.room_code = r.room_code and s.user_id = r.host_id limit 1), '—'),
    r.updated_at
  from public.game_rooms r
  order by (r.status = 'playing') desc, r.updated_at desc
  limit 100;
end;
$$;
revoke all on function public.admin_list_rooms() from public, anon;
grant execute on function public.admin_list_rooms() to authenticated;

create or replace function public.admin_recent_actions(p_limit integer default 30)
returns table (id bigint, admin_name text, action text, target text, detail text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select a.id, coalesce(p.display_name, 'Админ'), a.action, a.target, a.detail, a.created_at
  from public.admin_actions a
  left join public.profiles p on p.id = a.admin_id
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
revoke all on function public.admin_recent_actions(integer) from public, anon;
grant execute on function public.admin_recent_actions(integer) to authenticated;

-- ---------- admin writes ----------

create or replace function public.admin_reply_feedback(p_id bigint, p_reply text, p_resolve boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
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
revoke all on function public.admin_reply_feedback(bigint, text, boolean) from public, anon;
grant execute on function public.admin_reply_feedback(bigint, text, boolean) to authenticated;

-- An empty message takes the announcement down.
create or replace function public.admin_set_announcement(p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  body text := nullif(trim(coalesce(p_message, '')), '');
begin
  update public.announcements set active = false where active;
  if body is not null then
    insert into public.announcements (message, created_by) values (left(body, 200), me);
  end if;
  insert into public.admin_actions (admin_id, action, detail)
  values (me, case when body is null then 'announcement-clear' else 'announcement' end, left(body, 120));
end;
$$;
revoke all on function public.admin_set_announcement(text) from public, anon;
grant execute on function public.admin_set_announcement(text) to authenticated;
